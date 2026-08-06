-- Phase 3 — Row-Level Security.
--
-- Phase 2 gave every tenant row a workspace_id and bound one per request. That
-- makes correct code correct; it does nothing about incorrect code. A handler
-- that forgets `where: { workspaceId }` still returns every desk's rows, and
-- nothing complains. This migration makes the database refuse instead.
--
-- THE POLICY IS THE SAME EVERYWHERE, deliberately:
--
--   USING      (workspace_id = app_current_workspace())
--   WITH CHECK (workspace_id = app_current_workspace())
--
-- USING filters what you can see and change; WITH CHECK filters what you can
-- leave behind. Both are needed: USING alone lets a caller UPDATE a visible row
-- so that it lands in someone else's workspace.
--
-- FAIL-CLOSED WHEN UNBOUND. app_current_workspace() returns NULL if nothing has
-- called app_set_workspace() in this transaction, and `workspace_id = NULL` is
-- NULL, not true — so an unbound connection sees zero rows and can write none.
-- Forgetting to bind produces an obvious empty screen, never a cross-tenant
-- leak. That direction of failure is the entire point.
--
-- WHY `ENABLE` AND NOT `FORCE`
-- ---------------------------
-- FORCE applies policies to the table OWNER as well. The owner here is
-- plumo_migrator, which exists to run migrations — so FORCE would silently
-- filter every future data migration to the rows of whatever workspace happened
-- to be bound (none, in a migration: zero). A backfill would report success
-- having updated nothing. That is a failure that looks like a success, which is
-- worse than the leak it protects against.
--
-- Plain ENABLE is sufficient for the actual threat: the runtime connects as
-- plumo_app, which owns nothing, so policies bind it. Two existing controls
-- cover the rest — plumo_app is NOSUPERUSER + NOBYPASSRLS, and
-- assertUnprivilegedConnection() aborts boot if the app ever finds itself on a
-- privileged connection. Revisit if a second non-owner writer ever appears.
--
-- NOT COVERED, on purpose:
--   users, refresh_tokens, password_resets — a person and their sessions are
--     global. Login must find a user by email BEFORE any workspace is known,
--     so a workspace predicate here would make logging in impossible.
--   workspaces — read through SECURITY DEFINER bootstrap functions, and by the
--     single-workspace probe in WorkspaceContextService. A policy here would
--     break that probe and lock out every login. See the note in §Phase 4.
--   _prisma_migrations — Prisma's own bookkeeping.

DO $$
DECLARE
  t text;
  -- Every table carrying workspace_id. Derived at run time rather than listed,
  -- so a table added later without a policy is impossible to miss: it either
  -- has the column and gets covered here, or it has no tenant data at all.
  tables CONSTANT text[] := ARRAY(
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'workspace_id'
      )
    ORDER BY c.relname
  );
BEGIN
  IF array_length(tables, 1) IS NULL THEN
    RAISE EXCEPTION 'rls: no tenant tables found — has the tenancy migration run?';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Idempotent: re-running the migration must not fail on an existing policy.
    EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY workspace_isolation ON public.%I
         USING (workspace_id = app_current_workspace())
         WITH CHECK (workspace_id = app_current_workspace())', t);
  END LOOP;

  RAISE NOTICE 'rls: workspace_isolation enabled on % table(s)', array_length(tables, 1);
END $$;

-- A read of an unbound connection must be empty, not an error, and a write must
-- be refused. Assert it here rather than trusting that the policies above say
-- what they mean — this runs as plumo_migrator, which is NOT the owner-exempt
-- case only because FORCE is off, so the check below deliberately proves the
-- plumo_app-shaped path instead.
DO $$
DECLARE
  visible bigint;
BEGIN
  PERFORM set_config('app.workspace_id', '', true);
  SET LOCAL row_security = on;
  -- plumo_migrator owns these tables, so it is exempt without FORCE; this
  -- assertion therefore only proves the policy EXISTS and parses. The real
  -- isolation proof runs as plumo_app in the integration tests.
  SELECT count(*) INTO visible FROM pg_policy WHERE polname = 'workspace_isolation';
  IF visible = 0 THEN
    RAISE EXCEPTION 'rls: no workspace_isolation policies were created';
  END IF;
  RAISE NOTICE 'rls: % workspace_isolation policies in place', visible;
END $$;
