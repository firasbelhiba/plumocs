-- pm_oauth_states.workspace_id -> link_workspace_id.
--
-- A HINT STOPS CLAIMING TO BE A TENANT KEY.
--
-- `workspace_id` is the one column name in this schema that carries an
-- invariant: the tenancy migration derives its policy list from "has a
-- workspace_id column", and db-roles.integration.spec.ts asserts, against the
-- catalogue, that every such table has row-level security and a
-- workspace_isolation policy. The name IS the declaration. Exactly one table
-- declared it and meant something else, and it has been sitting in an exemption
-- list ever since — documented, argued for, and still a place the next table
-- can hide.
--
--
-- ============================================================================
-- WHY THE POLICY GENUINELY CANNOT GO ON THIS TABLE
-- ============================================================================
-- pm_oauth_states holds the in-flight half of a PKCE handshake: one row per
-- authorization attempt, addressed by `state` (32 random bytes, UNIQUE, consumed
-- on use), expiring in ten minutes. Rows are CREATED BEFORE ANYBODY IS SIGNED IN
-- and read back by a callback that is @Public() and therefore runs on a
-- connection with no workspace bound — that is what the handshake is for.
--
-- Under the standard predicate
--
--   USING (workspace_id = app_current_workspace())
--
-- an unbound read compares NULL to NULL, which is NULL rather than true. Every
-- row would be invisible and EVERY PM SIGN-IN WOULD FAIL. Enabling RLS here
-- tightens nothing; it turns sign-in off. Production bears this out: all 24
-- rows carry NULL, because every state so far came from a sign-in rather than
-- from the Settings link flow.
--
--
-- ============================================================================
-- WHY RENAME RATHER THAN DROP, OR EXEMPT
-- ============================================================================
-- DROP is wrong: the column is live. pm-identity.service.ts writes it at the
-- start of a LINK (`workspaceId: input.workspaceId ?? null`) and reads it back
-- on the callback, where pm-identity.module.ts uses it to decide which CS desk
-- to map to a PM workspace. Losing it loses the mapping.
--
-- EXEMPT is what we had. An exemption list passes for a list of any length; the
-- spec worked hard to make it not do that, and the machinery was still an
-- affordance for waving the next table through with a one-line edit.
--
-- RENAME says the true thing instead. This value is not the tenant that owns
-- the row — the row has no tenant, it belongs to a handshake. It is a HINT the
-- caller carried through a redirect: "if this comes back and it is a link,
-- that is the desk to map". `link_` because the codebase already names the two
-- flows LINK and SIGN-IN everywhere (pm-identity.service.ts:44-50,
-- pm-identity.module.ts:212-230), and because the prefix explains the NULL for
-- free: no link, no desk to name. After this, "has a workspace_id column" means
-- exactly "is tenant data", with no exceptions to remember.
--
--
-- ============================================================================
-- WHY THERE IS NO TABLE REWRITE
-- ============================================================================
-- RENAME COLUMN edits pg_attribute.attname and nothing else. Heap pages are
-- untouched, indexes and constraints keep their OIDs, and dependent objects
-- reference columns by attnum rather than by name, so they follow automatically
-- — including the FK to workspaces, which assertion (3) proves rather than
-- assumes.
--
-- It does take an ACCESS EXCLUSIVE lock, which on any other table would need a
-- word about timing. Not here: this table holds only handshakes younger than
-- ten minutes, no report or job reads it, and the lock is held for a catalogue
-- update. The real window is not the lock — see the deploy note below.
--
--
-- ============================================================================
-- THE DEPLOY WINDOW, STATED RATHER THAN GLOSSED
-- ============================================================================
-- ops/deploy-native.sh migrates (:107) and THEN restarts (:137). Between those
-- two, the running process holds a Prisma client that still selects and inserts
-- `workspace_id`, and that column is gone. A PM sign-in begun or completed in
-- that gap fails with an error the user is told to retry, and retrying after the
-- restart works. Nothing is lost: a state row is worthless the moment it is not
-- completed, and they are pruned anyway.
--
-- There is no expand/contract version of this that is cheaper than the gap. The
-- alternative — add link_workspace_id, dual-write, backfill, drop — leaves
-- BOTH names on the table across two deploys, and for the length of the middle
-- deploy the invariant this migration exists to restore would still be false.
--
--
-- ============================================================================
-- THE NAMES GET RENAMED TOO, NOT JUST THE COLUMN
-- ============================================================================
-- Postgres will happily leave `pm_oauth_states_workspace_id_fkey` on a table
-- whose column is now link_workspace_id, and a constraint-violation message
-- naming a column that does not exist is exactly the trap this file is trying
-- to remove. 20260808120000_rename_organizations_to_companies learned this the
-- hard way and its lesson is copied here: LOOP THE CATALOGUE, do not hand-list.
-- PostgreSQL 18 gives NOT NULL constraints full pg_constraint rows (contype
-- 'n') and therefore real names; before 18 they lived only in pg_attribute.
-- Either way they are invisible in \d and in a schema dump's column list, so
-- any hand-written list was always going to miss a category. (This column is
-- nullable, so there is no NOT NULL constraint to catch today — the loop is
-- what makes that a fact rather than an assumption.)
--
-- CI (postgres:18, backend-ci.yml:88) and production both run 18, so the loop
-- is load-bearing on both.
--
-- 20260808120000 states this boundary as "FROM POSTGRESQL 17 ONWARD", which is
-- wrong — the catalog patch was reverted from 17 and shipped in 18. It is left
-- uncorrected DELIBERATELY: that migration is applied, Prisma checksums applied
-- migrations, and editing the file would fail `migrate deploy` on every
-- database that already ran it. Correcting prose is not worth breaking a
-- deploy. The correction lives here and in docs/organization-vs-workspace.md.
-- ============================================================================


-- ---- 1. the column ---------------------------------------------------------

ALTER TABLE pm_oauth_states RENAME COLUMN workspace_id TO link_workspace_id;

COMMENT ON COLUMN pm_oauth_states.link_workspace_id IS
  'NOT A TENANT KEY — this table holds no tenant data and has no workspace_isolation policy. '
  'A hint carried across the OAuth round trip: the CS desk to map to a PM workspace if this '
  'flow comes back as a LINK. NULL for a sign-in, which begins with no workspace known.';


-- ---- 2. everything named after the old column ------------------------------
--
-- One predicate, used by both the rename and assertion (2) below: a name that
-- contains `workspace_id` and is not already the new `link_workspace_id`. The
-- loop and the check agreeing is what makes the check reachable — a migration
-- whose assertion asks for something its own statements cannot produce is a
-- migration that can never succeed.
--
-- Constraints first. RENAME CONSTRAINT also renames the index backing a PRIMARY
-- KEY or UNIQUE constraint — they are one object with one name — so anything it
-- covers has already left the index loop's predicate by the time that runs.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname AS name,
           replace(con.conname, 'workspace_id', 'link_workspace_id') AS renamed
    FROM pg_constraint con
    WHERE con.conrelid = 'public.pm_oauth_states'::regclass
      AND con.conname LIKE '%workspace_id%'
      AND con.conname NOT LIKE '%link_workspace_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.pm_oauth_states RENAME CONSTRAINT %I TO %I', c.name, c.renamed);
  END LOOP;

  FOR c IN
    SELECT i.relname AS name,
           replace(i.relname, 'workspace_id', 'link_workspace_id') AS renamed
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    WHERE x.indrelid = 'public.pm_oauth_states'::regclass
      AND i.relname LIKE '%workspace_id%'
      AND i.relname NOT LIKE '%link_workspace_id%'
  LOOP
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I', c.name, c.renamed);
  END LOOP;

  FOR c IN
    SELECT t.tgname AS name,
           replace(t.tgname, 'workspace_id', 'link_workspace_id') AS renamed
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.pm_oauth_states'::regclass
      AND NOT t.tgisinternal
      AND t.tgname LIKE '%workspace_id%'
      AND t.tgname NOT LIKE '%link_workspace_id%'
  LOOP
    EXECUTE format('ALTER TRIGGER %I ON public.pm_oauth_states RENAME TO %I', c.name, c.renamed);
  END LOOP;
END $$;


-- ============================================================================
-- ASSERTIONS
--
-- Same habit as the tenancy, RLS and companies migrations: prove the claims in
-- the header rather than trusting them. A rename that half-lands is a rename
-- that looks like it worked.
-- ============================================================================

DO $$
DECLARE
  bad       text;
  n         int;
  linked    int;
  -- v_ prefixed so nothing here can collide with the catalogue columns the
  -- queries below select by the same names; plpgsql resolves an ambiguous
  -- unqualified identifier by raising, at run time, inside the migration.
  v_attnum  smallint;
  v_atttype oid;
  v_notnull boolean;
BEGIN
  -- (1) the column moved, kept its type, and — critically — kept its
  --     nullability. A NOT NULL here would refuse every sign-in, which is the
  --     same failure enabling RLS would have caused, arrived at from the other
  --     direction.
  SELECT a.attnum, a.atttypid, a.attnotnull INTO v_attnum, v_atttype, v_notnull
    FROM pg_attribute a
   WHERE a.attrelid = 'public.pm_oauth_states'::regclass
     AND a.attname = 'link_workspace_id'
     AND NOT a.attisdropped;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pm oauth rename: link_workspace_id is not on pm_oauth_states';
  END IF;
  IF v_atttype <> 'uuid'::regtype THEN
    RAISE EXCEPTION 'pm oauth rename: link_workspace_id is %, not uuid', v_atttype::regtype;
  END IF;
  IF v_notnull THEN
    RAISE EXCEPTION 'pm oauth rename: link_workspace_id became NOT NULL — every PM sign-in passes NULL here';
  END IF;

  -- (2) nothing on this table still answers to the old name. pg_attribute
  --     catches the column, pg_class the indexes, pg_constraint the constraints
  --     (including the PG18 catalogued NOT NULLs invisible in \d), and
  --     pg_trigger the triggers.
  SELECT string_agg(obj, ', ' ORDER BY obj) INTO bad FROM (
    SELECT a.attname::text AS obj
      FROM pg_attribute a
     WHERE a.attrelid = 'public.pm_oauth_states'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname LIKE '%workspace_id%' AND a.attname NOT LIKE '%link_workspace_id%'
    UNION ALL
    SELECT i.relname::text
      FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = 'public.pm_oauth_states'::regclass
       AND i.relname LIKE '%workspace_id%' AND i.relname NOT LIKE '%link_workspace_id%'
    UNION ALL
    SELECT con.conname::text
      FROM pg_constraint con
     WHERE con.conrelid = 'public.pm_oauth_states'::regclass
       AND con.conname LIKE '%workspace_id%' AND con.conname NOT LIKE '%link_workspace_id%'
    UNION ALL
    SELECT t.tgname::text
      FROM pg_trigger t
     WHERE t.tgrelid = 'public.pm_oauth_states'::regclass
       AND NOT t.tgisinternal
       AND t.tgname LIKE '%workspace_id%' AND t.tgname NOT LIKE '%link_workspace_id%'
  ) s;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'pm oauth rename: object(s) still named for the old column: %', bad;
  END IF;

  -- (3) the foreign key followed the rename and kept ON DELETE CASCADE. It is
  --     what stops a deleted desk leaving a state row pointing at nothing; if
  --     it had been lost, nothing would complain until the first workspace
  --     delete failed on a dependency nobody remembers.
  SELECT count(*) INTO n
    FROM pg_constraint con
   WHERE con.conrelid = 'public.pm_oauth_states'::regclass
     AND con.contype = 'f'
     AND con.confrelid = 'public.workspaces'::regclass
     AND con.confdeltype = 'c'
     AND con.conkey = ARRAY[v_attnum];
  IF n <> 1 THEN
    RAISE EXCEPTION 'pm oauth rename: expected 1 ON DELETE CASCADE FK from link_workspace_id to workspaces, found %', n;
  END IF;

  -- (4) THE POINT OF THE WHOLE FILE. Every table in public carrying a
  --     workspace_id column now has row-level security ON and a
  --     workspace_isolation policy — with nothing subtracted, no exemption
  --     list, and no argument attached.
  --
  --     This is the schema-wide check docs/organization-vs-workspace.md asked
  --     for. It is stated here as well as in db-roles.integration.spec.ts on
  --     purpose: the spec is the tighter net (it runs on every push, against
  --     the whole schema, as the unprivileged role), but it only ever runs
  --     where CI runs. A table added by a migration on a machine that never
  --     runs the suite is caught by this line, at apply time, in the
  --     transaction that introduced it.
  SELECT string_agg(c.relname::text, ', ' ORDER BY c.relname) INTO bad
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r'
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                    AND a.attname = 'workspace_id')
     AND (NOT c.relrowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policy p
                          WHERE p.polrelid = c.oid AND p.polname = 'workspace_isolation'));
  IF bad IS NOT NULL THEN
    -- The remedy goes in a HINT rather than in the message: RAISE takes ONE
    -- format literal, and the next person to hit this needs both options, not
    -- just the accusation.
    RAISE EXCEPTION 'tenancy: table(s) carry workspace_id with no row-level security: %', bad
      USING HINT = 'Give it the workspace_isolation policy; or, if it is not tenant data, name the column something that does not claim to be a tenant key — the way pm_oauth_states.link_workspace_id does.';
  END IF;

  -- (5) record what the header claims about production. A NOTICE and not an
  --     EXCEPTION: these rows expire in ten minutes, so the counts are a
  --     snapshot of one moment and nothing here should fail because a link flow
  --     happened to be in flight.
  SELECT count(*), count(*) FILTER (WHERE link_workspace_id IS NOT NULL)
    INTO n, linked FROM pm_oauth_states;
  RAISE NOTICE 'pm oauth rename: % in-flight state row(s), % naming a desk to link', n, linked;
END $$;
