-- Phase 4 groundwork: link Plumo CS records to Plumo PM ones.
--
-- FIXES A TYPE THAT COULD NEVER HAVE WORKED. `workspaces.pm_workspace_id` was
-- created as `uuid`, on the assumption that PM identifies workspaces by UUID.
-- It does not — PM is MongoDB, and its ids are ObjectIds: 24 hex characters,
-- like `699b4324b65aafb6840afa63`. A uuid column is 32 hex characters and
-- Postgres rejects anything else, so the very first attempt to record a PM
-- workspace would have failed with an invalid-input error.
--
-- The column is NULL everywhere today (nothing has ever written to it), so the
-- type change is free. Doing it now, before anything depends on it, costs one
-- ALTER; doing it later would mean a data migration.
--
-- TEXT rather than a fixed-width type on purpose: this is an opaque identifier
-- issued by another system. Encoding "24 hex characters" here would make CS
-- fail the day PM changes id format, for a constraint CS gains nothing from
-- enforcing.
ALTER TABLE workspaces
  ALTER COLUMN pm_workspace_id TYPE text USING pm_workspace_id::text;

COMMENT ON COLUMN workspaces.pm_workspace_id IS
  'The PM workspace this desk was linked to. A Mongo ObjectId string, opaque to CS.';

-- The user half of the link.
--
-- `pm_user_id` is the `sub` returned by PM''s /userinfo. It is the join key for
-- everything Phase 4 does, so two properties matter:
--
--   UNIQUE — one PM account maps to at most one CS user. Without it, a bug in
--   the callback could attach the same PM identity to several CS accounts, and
--   "sign in with PM" would then be ambiguous: whoever the query returned
--   first. That is an account-takeover shape, not a data-quality problem.
--
--   NULLABLE — CS accounts exist that have no PM account and never will. This
--   is a link, not a requirement.
--
-- Deliberately NOT keyed on email. People change email addresses; `sub` is
-- stable for the life of the account, which is the entire reason PM returns it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pm_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS users_pm_user_id_key
  ON users (pm_user_id)
  WHERE pm_user_id IS NOT NULL;

COMMENT ON COLUMN users.pm_user_id IS
  'The `sub` from PM /userinfo. Stable for the life of the PM account; never an email.';

-- NOTE: users is a global table (no workspace_id) and deliberately has no RLS
-- policy — the login path must find a user before any workspace is known. This
-- column inherits that, which is correct: identity is global, membership is not.
