-- Database role separation — the precondition for row-level security.
--
-- Until this ran, the API connected as `plumo`: a SUPERUSER with BYPASSRLS that
-- also owned every table. Postgres exempts a superuser from every policy
-- unconditionally, and a table owner from every policy unless the table also has
-- FORCE ROW LEVEL SECURITY. So a complete and correct policy set could install
-- with no error, no log line and no failing test, and enforce nothing at all.
-- The isolation tests would have passed trivially and told us we were safe.
--
-- After this script the runtime has no way to see another tenant's rows even if
-- every line of application code is wrong:
--
--   plumo            superuser, bootstrap and break-glass only. Not a connection
--                    string anywhere.
--   plumo_migrator   owns the schema and every object in it. Runs migrations.
--                    NOSUPERUSER, NOBYPASSRLS — so migrations are proven to work
--                    without superuser, which is what managed Postgres gives you.
--   plumo_app        the runtime. Owns nothing, cannot create anything, cannot
--                    bypass RLS. DML only, on tables that already exist.
--
-- Re-runnable: every step is idempotent, so this doubles as the provisioning
-- script for a fresh environment.
--
-- Usage (passwords come from the caller, never hardcoded):
--   psql -v app_password=... -v migrator_password=... -f prisma/sql/roles.sql

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- roles

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plumo_migrator') THEN
    CREATE ROLE plumo_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plumo_app') THEN
    CREATE ROLE plumo_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT;
  END IF;
END $$;

-- Re-asserted on every run: an ALTER ROLE elsewhere must not be able to quietly
-- hand either role a way around the policies we are about to write.
ALTER ROLE plumo_migrator NOSUPERUSER NOBYPASSRLS;
ALTER ROLE plumo_app      NOSUPERUSER NOBYPASSRLS NOCREATEDB;

ALTER ROLE plumo_migrator PASSWORD :'migrator_password';
ALTER ROLE plumo_app      PASSWORD :'app_password';

-- ---------------------------------------------------------------- ownership

ALTER SCHEMA public OWNER TO plumo_migrator;

-- Two classes of object are deliberately skipped, both via pg_depend:
--   deptype 'e' — owned by an extension (citext's operators, pgcrypto's
--                 functions). Reassigning those detaches the extension.
--   deptype 'a'/'i' — a serial or identity sequence belonging to a table
--                 column. Postgres refuses to reassign these on their own;
--                 they follow their table's owner, which we do set. Standalone
--                 sequences (ticket_number_seq) have no such dependency and are
--                 still picked up here.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'S', 'v', 'm')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
          AND d.deptype IN ('e', 'a', 'i')
      )
  LOOP
    EXECUTE format(
      CASE r.relkind
        WHEN 'r' THEN 'ALTER TABLE public.%I OWNER TO plumo_migrator'
        WHEN 'S' THEN 'ALTER SEQUENCE public.%I OWNER TO plumo_migrator'
        WHEN 'v' THEN 'ALTER VIEW public.%I OWNER TO plumo_migrator'
        WHEN 'm' THEN 'ALTER MATERIALIZED VIEW public.%I OWNER TO plumo_migrator'
      END, r.relname);
  END LOOP;

  -- the tsvector trigger function among them
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO plumo_migrator', r.sig);
  END LOOP;

  -- the enums (ticket_status, ticket_priority, …) whose declaration order the
  -- inbox sort depends on
  FOR r IN
    SELECT t.oid::regtype AS name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO plumo_migrator', r.name);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- privileges

-- No CREATE for the runtime: it cannot add a table that has no policy on it.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO plumo_app;
GRANT ALL   ON SCHEMA public TO plumo_migrator;

-- CREATE on the database, so migrations can install trusted extensions
-- (citext, pgcrypto, btree_gin) as plumo_migrator. Without it the very first
-- migration on a fresh environment dies on "permission denied to create
-- extension" — the extensions in the existing database were installed by the
-- superuser that used to own everything, which hid the gap. This grants no way
-- around row-level security: extension installation and schema creation are
-- both still subject to every policy on the tables themselves.
DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO plumo_migrator', current_database());
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO plumo_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO plumo_app;

-- Without these, the next migration creates a table the runtime cannot read and
-- the failure surfaces as a 500 in production rather than here.
ALTER DEFAULT PRIVILEGES FOR ROLE plumo_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plumo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE plumo_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO plumo_app;

-- ---------------------------------------------------------------- verify

-- Fails the script rather than leaving a half-applied state that looks fine.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(rolname, ', ') INTO bad
  FROM pg_roles
  WHERE rolname IN ('plumo_app', 'plumo_migrator') AND (rolsuper OR rolbypassrls);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'roles.sql: % can still bypass RLS', bad;
  END IF;

  SELECT string_agg(tablename, ', ') INTO bad
  FROM pg_tables WHERE schemaname = 'public' AND tableowner <> 'plumo_migrator';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'roles.sql: tables not owned by plumo_migrator: %', bad;
  END IF;

  IF has_schema_privilege('plumo_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'roles.sql: plumo_app can still CREATE in public';
  END IF;
END $$;
