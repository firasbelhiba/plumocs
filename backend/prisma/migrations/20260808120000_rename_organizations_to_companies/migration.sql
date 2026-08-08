-- Organization -> Company: renaming the CUSTOMER'S EMPLOYER.
--
-- "Organization" is what Plumo PM calls a TENANT. In Plumo CS this table has
-- always meant something else entirely: the company a customer works for — the
-- Zendesk/Intercom concept, a child row that lives inside a workspace and
-- cannot exist without one. One word, two products, two meanings, and the
-- collision has already cost real time: backend/docs/organization-vs-workspace.md
-- exists only because someone read this schema and reasonably concluded the
-- tenancy model was broken. It was not. The word was.
--
-- `workspaces` stays the tenant and keeps its name. Only the smaller thing moves.
--
--
-- ============================================================================
-- WHY THIS IS FREE TODAY AND WOULD NOT BE LATER
-- ============================================================================
-- Production has ZERO rows in `organizations`, and zero `customers` and zero
-- `tickets` carry an organization_id. NO DATA MOVES HERE. The feature was
-- modelled and never switched on, so the rename is pure catalog surgery against
-- an empty table with no referents.
--
-- The statements below would still be catalog-only once the console starts
-- filing customers under companies — but they take ACCESS EXCLUSIVE locks on
-- `customers` and `tickets`, the two hottest tables in the product, and would
-- then need a maintenance window and a lock_timeout. Doing it now costs
-- milliseconds. Assertion (4) records the row counts at apply time so a future
-- reader can see whether this paragraph was still true when it ran.
--
--
-- ============================================================================
-- WHY THERE IS NO TABLE REWRITE
-- ============================================================================
-- RENAME TABLE and RENAME COLUMN edit pg_class.relname and pg_attribute.attname
-- and nothing else. Heap pages are untouched, every index and constraint keeps
-- its OID, and dependent objects reference the table by OID and its columns by
-- attnum — never by name — so they follow automatically.
--
-- That is also what carries the composite foreign keys through the column
-- rename with their PostgreSQL 15 column-list action intact. §11 of
-- 20260802000000_workspace_tenancy wrote them as
--
--   FOREIGN KEY (workspace_id, organization_id) REFERENCES organizations (workspace_id, id)
--     ON UPDATE CASCADE ON DELETE SET NULL (organization_id)
--
-- and that trailing column list — mandatory there, because the plain form would
-- try to null workspace_id too and hit the NOT NULL — is stored as attnums in
-- pg_constraint.confdelsetcols. Assertion (3) proves it survived rather than
-- assuming it did, because losing it fails at DELETE time in production, long
-- after this file was reviewed.
--
--
-- ============================================================================
-- THE RLS POLICY IS NOT DROPPED AND RECREATED — VERIFIED, NOT ASSUMED
-- ============================================================================
-- Checked against prisma/migrations/20260806140000_row_level_security, which
-- creates one identical policy per tenant table:
--
--   CREATE POLICY workspace_isolation ON public.<table>
--     USING      (workspace_id = app_current_workspace())
--     WITH CHECK (workspace_id = app_current_workspace())
--
-- Two properties of that exact policy make the rename transparent to it.
-- It is attached by relation OID (pg_policy.polrelid), so it travels with the
-- table rather than with the table's name. And its predicate names ONLY
-- workspace_id — a column this migration does not touch — so there is no stored
-- expression here that needs rewriting either. Nothing about `organizations`
-- appears in the policy at all.
--
-- Dropping and recreating it would be strictly worse: it would open a window
-- inside this transaction where `companies` has RLS enabled and no policy, and
-- it would fork the one predicate that migration went to some length to keep
-- byte-identical across all 18 tenant tables. Assertion (1) proves the policy is
-- still in place afterwards.
--
--
-- ============================================================================
-- THE NAMES GET RENAMED TOO, NOT JUST THE TABLE
-- ============================================================================
-- Postgres is perfectly happy to leave `organizations_pkey` and
-- `customers_workspace_id_organization_id_idx` sitting on a `companies` table
-- forever. Everything is renamed so that the next person reading \d companies,
-- an EXPLAIN plan, or a constraint-violation message is not hunting a table
-- that no longer exists. Assertion (2) fails the migration if any name was
-- missed.
-- ============================================================================


-- ---- 1. the table ----------------------------------------------------------

ALTER TABLE organizations RENAME TO companies;


-- ---- 2. its own constraints and its immutability trigger -------------------
--
-- RENAME CONSTRAINT also renames the index backing a PRIMARY KEY or UNIQUE
-- constraint — they are one object with one name — so these three statements
-- cover organizations_pkey's index and the (workspace_id, id) unique index that
-- the composite FKs below point at.

ALTER TABLE companies RENAME CONSTRAINT organizations_pkey                TO companies_pkey;
ALTER TABLE companies RENAME CONSTRAINT organizations_workspace_id_id_key TO companies_workspace_id_id_key;
ALTER TABLE companies RENAME CONSTRAINT organizations_workspace_id_fkey   TO companies_workspace_id_fkey;

-- The BEFORE UPDATE OF workspace_id guard from §9 of the tenancy migration. It
-- keeps working under the old name — triggers are found by OID like everything
-- else — but assertion (6) of that migration looks it up as
-- <table>_workspace_immutable, and so will the next person auditing coverage.
ALTER TRIGGER organizations_workspace_immutable ON companies
  RENAME TO companies_workspace_immutable;


-- ---- 3. the two referencing columns ----------------------------------------

ALTER TABLE customers RENAME COLUMN organization_id TO company_id;
ALTER TABLE tickets   RENAME COLUMN organization_id TO company_id;

ALTER TABLE customers RENAME CONSTRAINT customers_organization_id_fkey TO customers_company_id_fkey;
ALTER TABLE tickets   RENAME CONSTRAINT tickets_organization_id_fkey   TO tickets_company_id_fkey;

-- NOT NULL CONSTRAINTS ARE NAMED OBJECTS FROM POSTGRESQL 17 ONWARD, and this
-- migration's own assertion caught that the hard way: CI failed with
--
--   organizations_id_not_null, organizations_name_not_null,
--   organizations_created_at_not_null, organizations_updated_at_not_null,
--   organizations_workspace_id_not_null
--
-- still sitting on a table now called `companies`. They are invisible in a
-- schema dump's column list and in \d output, so listing renames by hand was
-- always going to miss a category — production runs PG18 and would have failed
-- identically.
--
-- Done as a loop over the catalogue rather than five more hand-written lines, so
-- ANY organization-named constraint is caught, including kinds this file does not
-- anticipate. Both tables are covered because customers/tickets carry NOT NULL
-- constraints named for the old column too.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT rel.relname AS tbl, con.conname AS name,
           replace(con.conname, 'organization', 'company') AS renamed
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relnamespace = 'public'::regnamespace
      AND rel.relname IN ('companies', 'customers', 'tickets')
      AND con.conname LIKE '%organization%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', c.tbl, c.name, c.renamed);
  END LOOP;
END $$;

ALTER INDEX customers_workspace_id_organization_id_idx RENAME TO customers_workspace_id_company_id_idx;
ALTER INDEX tickets_workspace_id_organization_id_idx   RENAME TO tickets_workspace_id_company_id_idx;


-- ============================================================================
-- ASSERTIONS
--
-- Same habit as the tenancy and RLS migrations: prove the claims in the header
-- rather than trusting them. A rename that half-lands is a rename that looks
-- like it worked.
-- ============================================================================

DO $$
DECLARE
  bad text;
  n   int;
  r   record;
BEGIN
  -- (1) the workspace_isolation policy followed the table, and RLS is still on.
  --     This is the claim the header spends a section on; here it is checked.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'workspace_isolation' AND polrelid = 'public.companies'::regclass
  ) THEN
    RAISE EXCEPTION 'rename: companies lost its workspace_isolation policy — every desk would see every other desk''s companies';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.companies'::regclass) THEN
    RAISE EXCEPTION 'rename: row level security is no longer enabled on companies';
  END IF;

  -- (2) no organization-named object survives anywhere in public. pg_class
  --     covers tables AND indexes, so a missed ALTER INDEX is caught here.
  SELECT string_agg(obj, ', ') INTO bad FROM (
    SELECT c.relname::text AS obj
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname LIKE '%organization%'
    UNION ALL
    SELECT (c.relname || '.' || a.attname)::text
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname LIKE '%organization%'
    UNION ALL
    SELECT t.tgname::text
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname LIKE '%organization%'
    UNION ALL
    SELECT con.conname::text
      FROM pg_constraint con
     WHERE con.connamespace = 'public'::regnamespace AND con.conname LIKE '%organization%'
  ) s;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'rename: organization-named object(s) survive on a companies schema: %', bad;
  END IF;

  -- (3) both composite FKs still point at companies AND still carry the
  --     column-list SET NULL. If confdelsetcols had been lost, nothing would
  --     complain until the first DELETE of a company tried to null workspace_id
  --     and hit the NOT NULL.
  n := 0;
  FOR r IN
    SELECT con.conname,
           con.confrelid::regclass::text AS parent,
           con.confdeltype,
           (SELECT string_agg(att.attname, ',' ORDER BY att.attname)
              FROM unnest(con.confdelsetcols) AS k
              JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k) AS setcols
      FROM pg_constraint con
     WHERE con.contype = 'f'
       AND con.conname IN ('customers_company_id_fkey', 'tickets_company_id_fkey')
  LOOP
    n := n + 1;
    IF r.parent <> 'companies' THEN
      RAISE EXCEPTION 'rename: % points at %, not companies', r.conname, r.parent;
    END IF;
    IF r.confdeltype <> 'n' OR r.setcols IS DISTINCT FROM 'company_id' THEN
      RAISE EXCEPTION 'rename: % lost ON DELETE SET NULL (company_id) — action %, columns %',
        r.conname, r.confdeltype, coalesce(r.setcols, '<none>');
    END IF;
  END LOOP;
  IF n <> 2 THEN
    RAISE EXCEPTION 'rename: expected 2 company FKs, found %', n;
  END IF;

  -- (4) record what the header asserted about production. Deliberately a NOTICE
  --     and not an EXCEPTION: rows would not make the rename wrong, only more
  --     expensive, and failing here would strand any environment that had gone
  --     ahead and used the feature.
  SELECT count(*) INTO n FROM companies;
  RAISE NOTICE 'rename: % company row(s), % customer(s) and % ticket(s) referencing one',
    n,
    (SELECT count(*) FROM customers WHERE company_id IS NOT NULL),
    (SELECT count(*) FROM tickets   WHERE company_id IS NOT NULL);
END $$;
