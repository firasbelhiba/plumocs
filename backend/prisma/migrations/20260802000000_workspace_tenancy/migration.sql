-- ============================================================================
-- prisma/migrations/20260802000000_tenancy/migration.sql
--
-- Multi-tenancy for Plumo CS, in one file. Hand-written.
--
-- `prisma migrate diff` MUST NEVER BE APPLIED against this database. It is
-- blind to: tickets.search_tsv + tickets_tsv_trigger + tickets_tsv_update() +
-- refresh_ticket_tsv(); the partial unique indexes on customers and
-- ticket_messages; customers_identity_check; and — after this file — 22
-- composite foreign keys, 8 helper functions, 19 immutability triggers, the
-- ticket-number trigger, the per-workspace number sequences, both GIN
-- indexes, and the updated_at DEFAULTs added in section 2. A generated diff
-- proposes DROPping all of it.
--
-- THIS MIGRATION PRESERVES DATA. Every existing row is adopted by the bootstrap
-- workspace via the column DEFAULT in section 8. The only rows removed are
-- refresh_tokens and password_resets, because access tokens minted before this
-- carry role/teamId claims whose meaning changes — everyone re-authenticates
-- once. Section 18 asserts that no tenant row was left without a workspace.
--
-- Runs as plumo_migrator via Prisma's directUrl, inside Prisma's single
-- transaction. Every table is empty, so no CREATE INDEX CONCURRENTLY is needed
-- (and none could be used — CONCURRENTLY cannot run inside a transaction).
--
-- NOTE ON ENUMS. `workspace_status` is CREATEd here and USED here. That is
-- safe: the "unsafe use of new value of enum type" restriction applies to
-- ALTER TYPE ... ADD VALUE on a pre-existing type, not to a type created in the
-- same transaction. No existing enum is touched, so the load-bearing
-- declaration order of the seven current enums is preserved exactly.
-- ============================================================================


-- ============================================================================
-- 0. PREFLIGHT
--
-- A safety valve, not a formality.
--
-- This migration originally TRUNCATED every tenant table, because it was written
-- against a pre-launch database with nothing in it. By the time it was due to
-- run, the desk had been live for four days with 38 real conversations and 300+
-- messages from a partner chatbot. The guard below caught that and refused.
--
-- It now BACKFILLS instead: every existing row is adopted by the bootstrap
-- workspace and nothing is destroyed. What remains here is the check that the
-- migration has not already run.
-- ============================================================================

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.workspaces') IS NOT NULL THEN
    RAISE EXCEPTION 'tenancy: public.workspaces already exists — this migration has already run.';
  END IF;

  -- Announce the scale of the backfill. Not a guard: this migration preserves
  -- rows now, so data is expected. It is here because a surprising number in the
  -- deploy log — 0 when you expected thousands, or the reverse — is the cheapest
  -- signal that you are pointed at the wrong database.
  SELECT count(*) INTO n FROM tickets;
  RAISE NOTICE 'tenancy: adopting % existing ticket(s) into the bootstrap workspace', n;

  IF NOT EXISTS (SELECT 1 FROM users) THEN
    RAISE EXCEPTION 'tenancy: no users — the bootstrap membership would have nobody to point at.';
  END IF;

  -- Every composite FK below depends on these three extensions already being
  -- present. They are, but a fresh environment built out of order would fail
  -- 400 lines later with an error naming the wrong thing.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext') THEN
    RAISE EXCEPTION 'tenancy: citext is not installed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'tenancy: pgcrypto is not installed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gin') THEN
    RAISE EXCEPTION 'tenancy: btree_gin is not installed — the multicolumn GINs need it'; END IF;

  -- This migration REVOKEs and GRANTs on objects it owns. If it is running as
  -- anything but the schema owner, those statements are the wrong shape.
  IF current_user <> 'plumo_migrator' THEN
    RAISE EXCEPTION
      'tenancy: running as "%", expected plumo_migrator. Prisma must use directUrl '
      '(MIGRATE_DATABASE_URL), not DATABASE_URL.', current_user;
  END IF;
END $$;


-- ============================================================================
-- 1. updated_at DEFAULTS
--
-- Ten tables carry `updated_at TIMESTAMPTZ NOT NULL` with NO database default,
-- because Prisma maintains it client-side via @updatedAt. That is invisible
-- until you write SQL by hand — and from this migration onward we do: the seed,
-- the verify script, every future data migration, every psql session. Without a
-- default, `INSERT INTO teams (name) VALUES ('Tier 1')` fails with a not-null
-- violation on a column nobody thinks about.
--
-- Harmless to Prisma: it still sends updated_at explicitly on every create and
-- update, so the default is never reached through the ORM. It only rescues raw
-- SQL. `prisma migrate diff` will propose dropping these ten defaults — they go
-- on the CI allowlist with everything else it cannot see.
-- ============================================================================

ALTER TABLE organizations    ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE customers        ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE users            ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE teams            ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE business_hours   ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE sla_policies     ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE tickets          ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE tags             ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE canned_responses ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE webhooks         ALTER COLUMN updated_at SET DEFAULT now();

-- Same problem, different table: export_state.watermark is NOT NULL with no
-- default, and after section 9 a brand-new tenant needs a cursor row before it
-- has ever exported. Epoch means "export everything", which is correct for a
-- first run.
ALTER TABLE export_state ALTER COLUMN watermark SET DEFAULT to_timestamp(0);


-- ============================================================================
-- 2. THE TENANT-BINDING READER, AND THE IMMUTABILITY GUARD
-- ============================================================================

-- The workspace bound to the current transaction, or NULL if none is.
--
-- Defined ONCE, and deliberately WITHOUT a `SET` clause. A SQL function
-- carrying a proconfig entry cannot be inlined by the planner, and every
-- Phase-3 RLS predicate is `workspace_id = app_current_workspace()`. Losing
-- inlining there costs every tenant-filtered query its index scan. There is
-- nothing schema-resolvable in the body to harden anyway — only
-- current_setting() and a cast.
--
-- STABLE, not IMMUTABLE: IMMUTABLE would let the planner fold one tenant's id
-- into a cached plan and hand it to the next request, which is the single worst
-- failure this schema can have. Not VOLATILE either, for the inlining reason
-- above. PARALLEL SAFE is correct — Postgres serialises GUC state into the
-- parallel worker DSM, so a SET LOCAL value is visible to workers.
--
-- NULLIF is load-bearing, not tidiness. After set_config(..., true) the GUC
-- remains *defined* at session level as an empty string once the transaction
-- ends, so current_setting(...,true) returns '' rather than NULL and a bare
-- ''::uuid raises "invalid input syntax for type uuid". Returning NULL instead
-- produces a clean, legible not-null violation. Fails closed either way.
CREATE FUNCTION app_current_workspace() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

COMMENT ON FUNCTION app_current_workspace() IS
  'Workspace bound to the current transaction. NULL when unbound, so every equality '
  'policy yields zero rows and every tenant INSERT fails NOT NULL. Do not add a SET '
  'clause: it would block planner inlining under RLS.';


-- workspace_id is immutable once written.
--
-- This is the guard composite foreign keys cannot provide. They ensure a row's
-- references are consistent with its OWN workspace_id; they say nothing about
-- that workspace_id changing. Because every tenant->tenant FK below is
-- ON UPDATE CASCADE, a single `UPDATE tickets SET workspace_id = <other>` would
-- cascade the entire conversation — messages, chat sessions, notifications —
-- into another tenant, consistently enough that no constraint would complain.
--
-- Does not reference OLD.id: export_state has no `id` of the usual shape
-- of that shape, and this function is attached to all 19 tenant-scoped tables.
CREATE FUNCTION deny_workspace_change() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'workspace_id is immutable (table %)', TG_TABLE_NAME
      USING ERRCODE = 'check_violation',
            HINT = 'Moving a row between workspaces is not supported. Create it in the target workspace.';
  END IF;
  RETURN NEW;
END
$$;


-- ============================================================================
-- 3. workspaces — THE TENANT
--
-- Not to be confused with `organizations`, which is a CUSTOMER's company
-- (Northwind Health). Both concepts exist and both keep their names.
-- ============================================================================

CREATE TYPE workspace_status AS ENUM ('active', 'suspended', 'deleting');

CREATE TABLE workspaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The URL/machine identity: /w/northwind/tickets, the workspace switcher, the
  -- X-Workspace-Slug header. citext because URLs are case-insensitive in
  -- practice, and the extension is already in use for users.email.
  slug            citext NOT NULL,

  -- The display label, separate from slug precisely so a rename does not break
  -- every stored URL a partner holds.
  name            text NOT NULL,

  -- ON DELETE RESTRICT below means SUSPENSION, not deletion, is the offboarding
  -- path. Without this column a delinquent tenant has no read-only state to be
  -- put into and there is no offboarding path at all.
  status          workspace_status NOT NULL DEFAULT 'active',

  -- Soft reference to Plumo PM. Deliberately NO foreign key: PM is a separate
  -- product and must not be touched, and a real FK would hard-couple the two
  -- products' deploy order. Phase 4 designs the link semantics.
  pm_workspace_id uuid,

  -- AFFORDANCE ONLY, and honestly labelled as one. Inbound email currently
  -- threads on `[Plumo #1042]` in the subject and on In-Reply-To against
  -- ticket_messages.email_message_id. BOTH are ambiguous across tenants after
  -- this migration. A per-workspace receiving address is how the email worker
  -- would resolve a tenant before either lookup. The column exists so Phase-3
  -- does not need a schema change; the application work is NOT done, and the
  -- email channel is a launch blocker until it is. See open questions.
  inbound_email   citext,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Lowercase enforced EXPLICITLY. citext does not override the regex
  -- operators — `slug ~ '...'` resolves to text ~ text through the implicit
  -- cast and is therefore case-sensitive — so relying on the pattern alone
  -- would silently force lowercase while the unique index stayed
  -- case-insensitive. Length is 1..40 (the trailing group is optional).
  CONSTRAINT workspaces_slug_format CHECK (
    slug::text = lower(slug::text)
    AND slug::text ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'
  ),

  -- Top-level routes a tenant slug must never shadow.
  CONSTRAINT workspaces_slug_not_reserved CHECK (
    slug::text NOT IN ('api','app','www','admin','auth','health','static',
                       'assets','docs','status','webhooks','w','login','signup')
  )
);

CREATE UNIQUE INDEX workspaces_slug_key ON workspaces (slug);

-- At most one CS workspace per PM workspace. Partial rather than plain: a plain
-- unique behaves identically today (Postgres treats NULLs as distinct) but the
-- partial form states the intent and stays correct if NULLS NOT DISTINCT is
-- ever adopted. Same precedent as customers_email_unique_idx.
CREATE UNIQUE INDEX workspaces_pm_workspace_id_key
  ON workspaces (pm_workspace_id) WHERE pm_workspace_id IS NOT NULL;

CREATE UNIQUE INDEX workspaces_inbound_email_key
  ON workspaces (inbound_email) WHERE inbound_email IS NOT NULL;

COMMENT ON TABLE workspaces IS
  'The tenant: one support desk. NOT `organizations`, which is a customer''s company.';
COMMENT ON COLUMN workspaces.inbound_email IS
  'Per-workspace receiving address. Affordance for resolving a tenant from an inbound '
  'email before the ticket-number / In-Reply-To lookups, which are both cross-tenant '
  'ambiguous after this migration. Not yet consumed by the application.';


-- ============================================================================
-- 4. workspace_memberships — THE CRUX
--
-- `users` is global; `teams` is tenant-owned; the live FK between them is the
-- cross-tenant pointer this whole migration exists to remove. team_id, role and
-- availability move here. One team per human PER WORKSPACE — which is the
-- cardinality the application actually implements (TeamScopeService compares
-- with equality, roundRobinAssignee filters on a scalar), so Principal.teamId
-- keeps its name, its `string | null` type and its meaning, and every one of the
-- ~60 equality sites compiles and stays correct unchanged. Only its PROVENANCE
-- changes: resolved per request from this row instead of from the JWT.
--
-- The team_id composite FK is added in section 11, once `teams` has its
-- workspace_id and UNIQUE (workspace_id, id).
-- ============================================================================

CREATE TABLE workspace_memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id      uuid NOT NULL,

  -- THE authoritative CS role. users.role is dropped in section 6: two sources
  -- of truth for authority is exactly how an admin of one desk becomes an admin
  -- of every desk, and RLS does not stop it because RLS filters rows, not
  -- authority.
  role         user_role NOT NULL DEFAULT 'agent',

  team_id      uuid,

  -- Per-desk, joined with the global users.is_active. Two different questions:
  -- "may this human authenticate at all" and "is this human still on this desk".
  -- Collapsing them means offboarding someone from one desk locks them out of
  -- every desk, which reads as an outage.
  is_active    boolean NOT NULL DEFAULT true,

  -- Per-desk shift state. Global availability means going off-shift on your own
  -- desk drains round-robin on a partner's desk.
  availability text NOT NULL DEFAULT 'available',

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_memberships_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
    ON UPDATE RESTRICT ON DELETE CASCADE,

  CONSTRAINT workspace_memberships_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  -- One membership per human per desk. This is ALSO the FK target for
  -- tickets.assignee_id, canned_responses.created_by, api_keys.created_by and
  -- notifications.user_id — which is what turns "must be a member of this
  -- workspace" from an application check into a structural fact.
  CONSTRAINT workspace_memberships_workspace_id_user_id_key
    UNIQUE (workspace_id, user_id)
);

-- "Which desks can I switch to?" on login, and the index the ON DELETE CASCADE
-- from users needs so deleting a human is not a sequential scan.
CREATE INDEX workspace_memberships_user_id_idx ON workspace_memberships (user_id);

-- Round-robin (available, active members of a team) and the referencing-side
-- index for the team_id composite FK added in section 11.
CREATE INDEX workspace_memberships_workspace_id_team_id_idx
  ON workspace_memberships (workspace_id, team_id);

COMMENT ON TABLE workspace_memberships IS
  'Global users joined to tenant workspaces. Carries the CS role, the per-desk team and '
  'the per-desk active/availability state. Offboarding is is_active = false, NOT DELETE: '
  'canned_responses.created_by and api_keys.created_by RESTRICT.';
COMMENT ON COLUMN workspace_memberships.team_id IS
  'Replaces users.team_id. Denormalised on purpose: a later team_memberships M2M can '
  'subsume this column without any FK shape changing.';


-- ============================================================================
-- 5. BOOTSTRAP
--
-- Runs BEFORE the users surgery so the memberships can be built from
-- users.role / users.availability while those columns still exist.
-- ============================================================================

INSERT INTO workspaces (slug, name) VALUES ('dar-blockchain', 'Dar Blockchain');

INSERT INTO workspace_memberships (workspace_id, user_id, role, is_active, availability)
SELECT w.id, u.id, u.role, u.is_active, u.availability
FROM users u
CROSS JOIN (SELECT id FROM workspaces WHERE slug = 'dar-blockchain') w;


-- ============================================================================
-- 6. users SURGERY
--
-- Dropped, not left nullable-and-ignored. A column that means nothing WILL be
-- read by some code path, and `prisma db pull` resurrects it. Leaving
-- users.role in particular is a live privilege-escalation bug: RolesGuard reads
-- principal.role, and a Principal built from a global role makes an admin of one
-- desk an admin of all of them.
--
-- Must precede section 8, which adds workspace_id to teams: the memberships
-- built in section 5 read users.team_id, so it has to still exist when they are
-- created and be gone before anything else reads it.
-- ============================================================================

-- Platform authority: who may create a workspace at all. No per-workspace role
-- can answer that question, and modelling it as a magic workspace or a reserved
-- role value invents a tenant that is not a tenant.
ALTER TABLE users ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;

UPDATE users SET is_platform_admin = true
WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1);

ALTER TABLE users DROP CONSTRAINT users_team_id_fkey;
DROP INDEX users_team_id_idx;
ALTER TABLE users DROP COLUMN team_id;
ALTER TABLE users DROP COLUMN role;
ALTER TABLE users DROP COLUMN availability;

-- users.is_active STAYS: the global "may this human authenticate" switch,
-- distinct from workspace_memberships.is_active.
-- users_email_key STAYS global: that is what global identity means.
-- The user_role enum is untouched — memberships use it, so its load-bearing
-- agent < lead < admin declaration order is preserved.

COMMENT ON COLUMN users.is_platform_admin IS
  'Platform authority (may create workspaces). NOT a CS role — those live on '
  'workspace_memberships.role.';


-- ============================================================================
-- 7. WHAT IS *NOT* DESTROYED
--
-- This section used to TRUNCATE every tenant table. It does not any more: the
-- desk went live before the migration ran, and those rows are a real customer's
-- support history.
--
-- Instead, section 8 gives every table a workspace_id defaulting to
-- app_current_workspace(), and the DEFAULT applies to existing rows as well when
-- the column is added — so all 38 conversations, their messages, their customers
-- and the partner's API key are adopted by the bootstrap workspace with no
-- explicit UPDATE needed. Section 18 asserts that none were left orphaned.
--
-- refresh_tokens and password_resets ARE still cleared, and that is a
-- correctness requirement rather than tidiness: every live access token carries
-- `role` and `teamId` claims whose meaning changes in this migration. A session
-- minted before it would carry a role that no longer means what it says.
-- Everyone signs in once more; nothing of value is lost.
--
-- audit_log is KEPT. Its entity_ids still resolve, because the entities they
-- point at still exist.
-- ============================================================================

DELETE FROM refresh_tokens;
DELETE FROM password_resets;


-- ============================================================================
-- 8. workspace_id ON EVERY TENANT-OWNED TABLE
--
-- 17 tables: the 13 agreed ones plus all four "ambiguous" ones. None of the four
-- is genuinely ambiguous once you stop treating workspace_id as a
-- denormalisation of the foreign-key graph. It is the TENANT BINDING, established
-- at authentication, and it exists before any parent row does:
--
--   attachments  — a pending upload is PARENTLESS, not TENANTLESS.
--                  POST /attachments/presign is an authenticated route.
--                  Nullable-until-linked was rejected: under an equality policy a
--                  NULL row matches nobody, so the uploader could not read back
--                  the row it just created and MessagesService.add's claim
--                  updateMany would match zero rows and return SUCCESS. Every
--                  upload would silently vanish.
--   export_state — `id` was never a row identity, it was a singleton marker. It
--                  keeps its real meaning as the job name and the tenant becomes
--                  the other half of the key (section 12). Left as a singleton,
--                  whichever tenant exports first advances the shared watermark
--                  past its own newest ticket and every other tenant is skipped
--                  forever, logging success every night.
--   notifications— a fact about work inside one workspace, including the ones
--                  with no ticket. Kept global, a user in workspace B sees
--                  workspace A's ticket subjects in notification.text — a
--                  content leak, not a metadata one.
--   audit_log    — NOT NULL, plus a separate identity_audit_log (section 15) for
--                  identity-plane events. A NULL workspace_id row under an
--                  equality policy is WRITE-ONLY: stored, then readable by nobody
--                  through the product, and the admin audit screen shows 0 rows
--                  rather than an error. NOT NULL also closes a live leak —
--                  AuditController.search is admin-only but entirely unscoped and
--                  today returns every tenant's diff_json to any admin.
--
-- Three statements per table, deliberately not one. `ADD COLUMN ... NOT NULL
-- DEFAULT <expr>` makes Postgres evaluate the default once at DDL time for the
-- attmissingval optimisation, and on a migration connection with no workspace
-- bound that expression is NULL. Adding nullable first sidesteps the question.
-- On empty tables SET NOT NULL is an instant catalog change.
--
-- The DEFAULT is the load-bearing part: Prisma does not model workspace_id as
-- required, so without it every one of ~40 create() call sites needs a hand edit
-- under launch pressure and a missed one is a production 500. With it, forgotten
-- code cannot write the WRONG workspace either — it writes NULL and dies.
--
-- ON DELETE RESTRICT / ON UPDATE RESTRICT, uniformly, on all 17. Deleting a
-- workspace must NOT delete its data: a 17-table cascade is an irreversible
-- one-statement tenant wipe and, at volume, an availability event. The
-- ON UPDATE RESTRICT half is what makes the immutability trigger airtight — it
-- removes the only legitimate way workspace_id could change, so the trigger has
-- no exception to carve out and cannot contradict a cascade.
-- ============================================================================

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'organizations','customers','teams','business_hours','sla_policies',
    'tickets','ticket_messages','tags','canned_responses','api_keys',
    'webhooks','webhook_deliveries','chat_sessions',
    'attachments','export_state','notifications','audit_log'
  ];
  boot_ws uuid;
BEGIN
  -- The one workspace section 5 created. Every pre-tenancy row is adopted by it,
  -- because before this migration there was only one desk.
  SELECT id INTO boot_ws FROM workspaces ORDER BY created_at LIMIT 1;
  IF boot_ws IS NULL THEN
    RAISE EXCEPTION 'tenancy: no bootstrap workspace to adopt existing rows into';
  END IF;

  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET DEFAULT app_current_workspace()', t);

    -- BACKFILL, and it must be explicit.
    --
    -- The DEFAULT does not populate existing rows here, because
    -- app_current_workspace() reads app.workspace_id — which is unset during a
    -- migration, so it returns NULL and every pre-existing row gets NULL. On an
    -- empty database that is invisible; against a live desk the very next
    -- statement fails with "column workspace_id contains null values", which is
    -- exactly how this was found.
    --
    -- Adopting them into the bootstrap workspace is correct because there is
    -- only one: everything that existed before tenancy belonged to the single
    -- desk this migration is creating.
    EXECUTE format('UPDATE public.%I SET workspace_id = $1 WHERE workspace_id IS NULL', t)
      USING boot_ws;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL', t);

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (workspace_id) '
      'REFERENCES public.workspaces (id) ON UPDATE RESTRICT ON DELETE RESTRICT',
      t, t || '_workspace_id_fkey');
  END LOOP;
END $$;


-- ============================================================================
-- 9. IMMUTABILITY TRIGGERS
--
-- 19 tables: the 17 above plus workspace_memberships (the AUTHORITY table — a
-- membership silently moved to another workspace grants a role there) and
-- every tenant table. BEFORE UPDATE **OF workspace_id** fires only
-- when the column appears in the SET list, so ordinary updates pay nothing.
-- ============================================================================

DO $$
DECLARE
  t text;
  boot_ws uuid;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','customers','teams','business_hours','sla_policies',
    'tickets','ticket_messages','tags','canned_responses','api_keys',
    'webhooks','webhook_deliveries','chat_sessions',
    'attachments','export_state','notifications','audit_log',
    'workspace_memberships'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OF workspace_id ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION deny_workspace_change()',
      t || '_workspace_immutable', t);
  END LOOP;
END $$;


-- ============================================================================
-- 10. UNIQUE (workspace_id, id) ON EVERY COMPOSITE-FK PARENT
--
-- A composite FK requires a unique key on exactly its referenced columns.
--
-- Primary keys are deliberately NOT repointed to (workspace_id, id). Prisma
-- cannot express @@id([workspaceId, id]) while keeping findUnique({where:{id}});
-- it would rewrite every findUnique / update / delete / connect in the codebase
-- to where: { workspaceId_id: { ... } }. And the index saving is illusory — `id`
-- alone must stay unique regardless, for URLs, chat_sessions and the
-- pending-attachment flow — so both indexes would exist either way.
--
-- These are not dead weight: workspace_id leads them, so they also back the
-- ON DELETE RESTRICT check from workspaces.
-- ============================================================================

ALTER TABLE organizations   ADD CONSTRAINT organizations_workspace_id_id_key   UNIQUE (workspace_id, id);
ALTER TABLE customers       ADD CONSTRAINT customers_workspace_id_id_key       UNIQUE (workspace_id, id);
ALTER TABLE teams           ADD CONSTRAINT teams_workspace_id_id_key           UNIQUE (workspace_id, id);
ALTER TABLE business_hours  ADD CONSTRAINT business_hours_workspace_id_id_key  UNIQUE (workspace_id, id);
ALTER TABLE sla_policies    ADD CONSTRAINT sla_policies_workspace_id_id_key    UNIQUE (workspace_id, id);
ALTER TABLE tickets         ADD CONSTRAINT tickets_workspace_id_id_key         UNIQUE (workspace_id, id);
ALTER TABLE ticket_messages ADD CONSTRAINT ticket_messages_workspace_id_id_key UNIQUE (workspace_id, id);
ALTER TABLE webhooks        ADD CONSTRAINT webhooks_workspace_id_id_key        UNIQUE (workspace_id, id);
ALTER TABLE api_keys        ADD CONSTRAINT api_keys_workspace_id_id_key        UNIQUE (workspace_id, id);


-- ============================================================================
-- 11. COMPOSITE FOREIGN KEYS
--
-- Every tenant->tenant reference becomes (workspace_id, X) -> (workspace_id, id),
-- which makes a cross-workspace reference UNREPRESENTABLE rather than merely
-- unwritten.
--
-- Where the referencing column is NULLABLE and the action is SET NULL, the
-- PostgreSQL 15+ column-list form is MANDATORY, not stylistic: the plain form
-- would try to null workspace_id too and raise a not-null violation at DELETE
-- time. Prisma's `onDelete: SetNull` emits exactly that broken plain form — one
-- of several reasons these FKs are not modelled in schema.prisma at all.
--
-- MATCH SIMPLE (the default) throughout: with workspace_id NOT NULL and the
-- other column nullable, the constraint is simply not checked when that column
-- is NULL. That is what keeps a pending attachment legal.
-- ============================================================================

-- ---- 11a. nullable references, column-list SET NULL ------------------------

ALTER TABLE customers DROP CONSTRAINT customers_organization_id_fkey;
ALTER TABLE customers ADD CONSTRAINT customers_organization_id_fkey
  FOREIGN KEY (workspace_id, organization_id) REFERENCES organizations (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (organization_id);

ALTER TABLE customers DROP CONSTRAINT customers_visitor_api_key_id_fkey;
ALTER TABLE customers ADD CONSTRAINT customers_visitor_api_key_id_fkey
  FOREIGN KEY (workspace_id, visitor_api_key_id) REFERENCES api_keys (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (visitor_api_key_id);

ALTER TABLE sla_policies DROP CONSTRAINT sla_policies_business_hours_id_fkey;
ALTER TABLE sla_policies ADD CONSTRAINT sla_policies_business_hours_id_fkey
  FOREIGN KEY (workspace_id, business_hours_id) REFERENCES business_hours (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (business_hours_id);

ALTER TABLE tickets DROP CONSTRAINT tickets_organization_id_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_organization_id_fkey
  FOREIGN KEY (workspace_id, organization_id) REFERENCES organizations (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (organization_id);

ALTER TABLE tickets DROP CONSTRAINT tickets_team_id_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_team_id_fkey
  FOREIGN KEY (workspace_id, team_id) REFERENCES teams (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (team_id);

ALTER TABLE tickets DROP CONSTRAINT tickets_sla_policy_id_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_sla_policy_id_fkey
  FOREIGN KEY (workspace_id, sla_policy_id) REFERENCES sla_policies (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (sla_policy_id);

ALTER TABLE tickets DROP CONSTRAINT tickets_created_by_api_key_id_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_created_by_api_key_id_fkey
  FOREIGN KEY (workspace_id, created_by_api_key_id) REFERENCES api_keys (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (created_by_api_key_id);

ALTER TABLE ticket_messages DROP CONSTRAINT ticket_messages_author_api_key_id_fkey;
ALTER TABLE ticket_messages ADD CONSTRAINT ticket_messages_author_api_key_id_fkey
  FOREIGN KEY (workspace_id, author_api_key_id) REFERENCES api_keys (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (author_api_key_id);

ALTER TABLE canned_responses DROP CONSTRAINT canned_responses_team_id_fkey;
ALTER TABLE canned_responses ADD CONSTRAINT canned_responses_team_id_fkey
  FOREIGN KEY (workspace_id, team_id) REFERENCES teams (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (team_id);

ALTER TABLE api_keys DROP CONSTRAINT api_keys_team_id_fkey;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_team_id_fkey
  FOREIGN KEY (workspace_id, team_id) REFERENCES teams (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (team_id);

ALTER TABLE notifications DROP CONSTRAINT notifications_ticket_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_ticket_id_fkey
  FOREIGN KEY (workspace_id, ticket_id) REFERENCES tickets (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (ticket_id);

-- The other half of the users.team_id resolution: a membership in workspace A
-- can now ONLY name a team whose workspace_id is also A.
ALTER TABLE workspace_memberships ADD CONSTRAINT workspace_memberships_team_id_fkey
  FOREIGN KEY (workspace_id, team_id) REFERENCES teams (workspace_id, id)
  ON UPDATE CASCADE ON DELETE SET NULL (team_id);


-- ---- 11b. plain composite form (NOT NULL, or CASCADE) ----------------------

ALTER TABLE tickets DROP CONSTRAINT tickets_customer_id_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_customer_id_fkey
  FOREIGN KEY (workspace_id, customer_id) REFERENCES customers (workspace_id, id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ticket_messages DROP CONSTRAINT ticket_messages_ticket_id_fkey;
ALTER TABLE ticket_messages ADD CONSTRAINT ticket_messages_ticket_id_fkey
  FOREIGN KEY (workspace_id, ticket_id) REFERENCES tickets (workspace_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ticket_message_id is NULLABLE (a pending presign) but the action is CASCADE,
-- so no column list applies and MATCH SIMPLE leaves pending rows unchecked.
-- This is the SECOND lock on the attachment claim step, independent of RLS: a
-- caller in workspace B re-parenting workspace A's pending upload produces the
-- pair (A, message-of-B), which is not in ticket_messages, so the UPDATE fails
-- on the constraint even if every policy were dropped tomorrow.
ALTER TABLE attachments DROP CONSTRAINT attachments_ticket_message_id_fkey;
ALTER TABLE attachments ADD CONSTRAINT attachments_ticket_message_id_fkey
  FOREIGN KEY (workspace_id, ticket_message_id) REFERENCES ticket_messages (workspace_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE webhook_deliveries DROP CONSTRAINT webhook_deliveries_webhook_id_fkey;
ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_webhook_id_fkey
  FOREIGN KEY (workspace_id, webhook_id) REFERENCES webhooks (workspace_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- chat_sessions' FKs were created inline by chatbot_ingest and carry Postgres'
-- auto-generated names.
ALTER TABLE chat_sessions DROP CONSTRAINT chat_sessions_api_key_id_fkey;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_api_key_id_fkey
  FOREIGN KEY (workspace_id, api_key_id) REFERENCES api_keys (workspace_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE chat_sessions DROP CONSTRAINT chat_sessions_ticket_id_fkey;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_ticket_id_fkey
  FOREIGN KEY (workspace_id, ticket_id) REFERENCES tickets (workspace_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;


-- ---- 11c. references to global users, repointed to memberships -------------
--
-- The hole composite FKs alone cannot close: nothing stopped workspace A from
-- naming a user with no membership in A. UNIQUE (workspace_id, user_id) on
-- memberships gives us a target, so this becomes structural. The column type and
-- the wire contract do not change — assignee_id is still a user uuid.
--
-- The plain FKs to users(id) are DROPPED rather than kept alongside:
-- workspace_memberships.user_id already references users ON DELETE CASCADE, so
-- existence is implied, and two FKs on one column with different targets is a
-- maintenance trap.

-- Assignment is transient: SET NULL, so removing someone from a desk is possible
-- while they hold tickets.
ALTER TABLE tickets DROP CONSTRAINT tickets_assignee_id_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_assignee_membership_fkey
  FOREIGN KEY (workspace_id, assignee_id) REFERENCES workspace_memberships (workspace_id, user_id)
  ON UPDATE CASCADE ON DELETE SET NULL (assignee_id);

-- Authorship is historical: RESTRICT, which makes DEACTIVATION (is_active =
-- false) the documented offboarding path. That is what you want anyway, so audit
-- trails and authorship survive.
ALTER TABLE canned_responses DROP CONSTRAINT canned_responses_created_by_fkey;
ALTER TABLE canned_responses ADD CONSTRAINT canned_responses_created_by_fkey
  FOREIGN KEY (workspace_id, created_by) REFERENCES workspace_memberships (workspace_id, user_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE api_keys DROP CONSTRAINT api_keys_created_by_fkey;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_created_by_fkey
  FOREIGN KEY (workspace_id, created_by) REFERENCES workspace_memberships (workspace_id, user_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- Done HERE, not deferred: NotificationsFanoutProcessor takes userIds straight
-- off a job payload and checks membership nowhere, and notification.text carries
-- ticket subjects. CASCADE because offboarding should take that desk's
-- notifications with it. A user deletion still reaches here transitively through
-- memberships.
ALTER TABLE notifications DROP CONSTRAINT notifications_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_membership_fkey
  FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_memberships (workspace_id, user_id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- DELIBERATELY UNCHANGED, still pointing at the global users table:
--   refresh_tokens.user_id, password_resets.user_id — locked decision.
--
-- DELIBERATELY UNCHANGED, still with NO foreign key at all:
--   ticket_messages.author_id — polymorphic (user OR customer). Composite FKs
--   cannot reach it, so an internal note can still name any uuid, including a
--   user from another workspace. See risks: the fix is splitting it into
--   author_user_id / author_customer_id, which is API-visible and out of scope.


-- ============================================================================
-- 12. export_state PRIMARY KEY
--
-- One cursor per (tenant, job). Left as PRIMARY KEY (id), the second workspace's
-- first upsert collides on export_state_pkey and the nightly export crashes for
-- every tenant after the first. `id` keeps DEFAULT 'daily' because it genuinely
-- is a job-name discriminator: a weekly feed or a per-partner feed then needs no
-- schema change.
-- ============================================================================

ALTER TABLE export_state DROP CONSTRAINT export_state_pkey;
ALTER TABLE export_state ADD CONSTRAINT export_state_pkey PRIMARY KEY (workspace_id, id);

-- ExportDailyProcessor's own comment says the watermark is a (updated_at, id)
-- pair, not just a timestamp, "because several tickets can share an updated_at
-- (a bulk close) and a strict > on the timestamp alone would skip the rest of
-- that group forever". The schema never had the id half, so the code compensates
-- with `gte` and re-exports the boundary tie-group every night. Adding it now,
-- while the table is empty, is free. NULLABLE: a tenant that has never exported
-- has no cursor.
--
-- SEPARABLE. If the partner integration is not idempotent, drop this one
-- statement and keep the `gte` behaviour — the tenancy change does not depend
-- on it.
ALTER TABLE export_state ADD COLUMN watermark_id uuid;

COMMENT ON COLUMN export_state.watermark_id IS
  'Second half of the (updated_at, id) export cursor. NULL before the first run.';


-- ============================================================================
-- 13. GAPLESS PER-WORKSPACE TICKET NUMBERS
--
-- A sequence cannot do this, for two independent reasons.
--   (a) nextval() is deliberately exempt from transaction semantics: the advance
--       is NOT rolled back, so any failed insert burns a number permanently —
--       a constraint violation, a client disconnect, an explicit ROLLBACK. And
--       sequence advances are WAL-logged only every 32 values (SEQ_LOG_VALS), so
--       an unclean shutdown burns up to 32 more with nobody at fault.
--   (b) One global sequence INTERLEAVES tenants — A gets 1043, B gets 1044, A
--       gets 1045 — so every workspace has holes even at a 100% success rate.
-- One sequence per workspace fixes (b) and not (a), and needs CREATE SEQUENCE
-- DDL that plumo_app cannot execute.
--
-- Gapless is logically identical to serialised: the allocation must become
-- visible atomically with the insert, which means holding it to commit, which is
-- a row lock. There is no third option.
-- ============================================================================

-- Deliberately NOT a column on `workspaces`: that would make every ticket insert
-- take a row lock on the workspace row itself, so ticket creation would block
-- workspace settings updates and vice versa. counter_name is generic so a second
-- gapless series (invoice numbers, export batches) is an INSERT, not an ALTER
-- TABLE holding ACCESS EXCLUSIVE on the tenant root table.
-- One sequence per workspace.
--
-- `nextval()` is deliberately exempt from transaction semantics: its advance
-- survives ROLLBACK. That is usually described as a defect ("it leaves gaps"),
-- but here it is the property being bought. A failed insert burns a number, so
-- #57 is never handed to a different conversation later — which matters far more
-- on a support desk than an unbroken run of integers.
--
-- The alternative, a counter row incremented inside the transaction, is truly
-- gapless but takes a row lock held until COMMIT. Because every query is routed
-- through the request's transaction, that lock would be held for the whole HTTP
-- request, serialising ticket creation per workspace. A gap is invisible to a
-- customer; a serialised inbox is not.
--
-- Per-workspace rather than one global sequence, because a single sequence
-- interleaves tenants — A gets 1043, B gets 1044, A gets 1045 — which looks
-- broken to the customer and leaks one tenant's ticket volume to another.

CREATE FUNCTION workspace_number_sequence(p_workspace_id uuid) RETURNS text
  LANGUAGE sql IMMUTABLE
AS $fn$ SELECT 'ticket_number_' || replace(p_workspace_id::text, '-', '') $fn$;

COMMENT ON FUNCTION workspace_number_sequence(uuid) IS
  'Name of a workspace''s ticket-number sequence. Derived from the id, never stored, '
  'so the two cannot drift apart.';

-- SECURITY DEFINER because CREATE SEQUENCE is DDL and plumo_app deliberately
-- holds no CREATE on the schema — that restriction is what stops the runtime
-- adding a table which escapes a future policy, and it must stay.
--
-- The escalation surface is two statements whose only input is a uuid: the
-- argument is typed, so it cannot carry a quote or a semicolon, and it is still
-- passed through format(%I). search_path is pinned so a caller cannot shadow
-- replace() or format() with their own.
CREATE FUNCTION workspaces_create_number_sequence() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $fn$
DECLARE seq text := public.workspace_number_sequence(NEW.id);
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I AS bigint START WITH 1 MINVALUE 1', seq);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO plumo_app', seq);
  RETURN NEW;
END
$fn$;

CREATE TRIGGER workspaces_number_sequence_trigger
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION workspaces_create_number_sequence();

-- The bootstrap workspace was inserted back in section 5, BEFORE the trigger
-- above existed, so it has no sequence yet. Without this loop the very first
-- ticket in the only workspace fails — and it would fail at runtime, in front of
-- a customer, not here.
DO $boot$
DECLARE w record; seq text;
BEGIN
  FOR w IN SELECT id FROM workspaces LOOP
    seq := workspace_number_sequence(w.id);
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I AS bigint START WITH 1 MINVALUE 1', seq);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO plumo_app', seq);
  END LOOP;
END
$boot$;


-- Allocation stays in the DATABASE, as a trigger, and that is forced rather than
-- stylistic. tickets.number is a column DEFAULT today, so NOTHING in application
-- code allocates it, and four creation paths depend on that (TicketsService.create,
-- the inbound-email job's own prisma.ticket.create, chatbot ingest, the seed).
-- A DEFAULT expression may not reference another column of the row being
-- inserted, so a DEFAULT keyed on workspace_id is syntactically impossible. A
-- trigger reads NEW.workspace_id and keeps all four paths working unchanged.
CREATE FUNCTION tickets_assign_number() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER
AS $fn$
DECLARE
  bound text := current_setting('app.workspace_id', true);
  seq   text;
BEGIN
  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'tickets.workspace_id is NULL; cannot allocate a ticket number'
      USING ERRCODE = 'not_null_violation';
  END IF;

  -- Catches a mis-bound transaction at the point of damage, rather than letting
  -- the row land in the wrong tenant carrying a plausible-looking number.
  IF bound IS NOT NULL AND bound <> '' AND bound::uuid <> NEW.workspace_id THEN
    RAISE EXCEPTION 'ticket workspace_id % does not match the bound app.workspace_id %',
      NEW.workspace_id, bound USING ERRCODE = 'raise_exception';
  END IF;

  seq := 'public.' || quote_ident(workspace_number_sequence(NEW.workspace_id));
  IF to_regclass(seq) IS NULL THEN
    RAISE EXCEPTION 'no ticket-number sequence for workspace % (expected %) — was the '
                    'workspace inserted with its AFTER INSERT trigger disabled?',
      NEW.workspace_id, seq USING ERRCODE = 'undefined_object';
  END IF;

  -- UNCONDITIONAL. A caller-supplied number is ignored, so the sequence stays the
  -- single source of truth and no application bug can leave it behind.
  NEW.number := nextval(seq::regclass);
  RETURN NEW;
END
$fn$;

GRANT EXECUTE ON FUNCTION workspace_number_sequence(uuid) TO plumo_app;
GRANT EXECUTE ON FUNCTION tickets_assign_number() TO plumo_app;

-- BEFORE ROW triggers fire in ALPHABETICAL order by trigger name.
-- 'tickets_number_trigger' < 'tickets_tsv_trigger', so numbering runs first.
-- They are independent anyway (tsv only reads NEW.subject), but the alphabetical
-- rule constrains anyone adding a third BEFORE INSERT trigger later.
CREATE TRIGGER tickets_number_trigger
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION tickets_assign_number();

ALTER TABLE tickets ALTER COLUMN number DROP DEFAULT;

-- DEFAULT 0 rather than no default, for two reasons: it keeps `number` optional
-- in the generated Prisma client (`@default(0)` in schema.prisma), and it pairs
-- with the CHECK below so a MISSING trigger fails on the FIRST insert instead of
-- silently numbering everything 0.
ALTER TABLE tickets ALTER COLUMN number SET DEFAULT 0;

-- CHECK constraints are evaluated AFTER BEFORE-ROW triggers fire, so this sees
-- the post-trigger value.
ALTER TABLE tickets ADD CONSTRAINT tickets_number_positive_check CHECK (number > 0);

-- Drop the orphan. An unused live sequence is a landmine: a restored dump or a
-- copy-pasted SET DEFAULT could silently reattach it, and the new
-- (workspace_id, number) unique would NOT catch it — interleaved numbers are
-- still unique, just wrong. Must come after DROP DEFAULT, which is the dependency.
DROP SEQUENCE IF EXISTS ticket_number_seq;



-- ============================================================================
-- 14. PER-WORKSPACE UNIQUE CONSTRAINTS
--
-- Names follow Prisma's own <table>_<cols>_key convention so that
-- @@unique([workspaceId, number]) in schema.prisma produces byte-identical DDL
-- and `migrate diff` reports no drift on these.
-- ============================================================================

-- Created by init as a bare unique INDEX, not a constraint. Guard both spellings.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_number_key;
DROP INDEX IF EXISTS tickets_number_key;
ALTER TABLE tickets ADD CONSTRAINT tickets_workspace_id_number_key UNIQUE (workspace_id, number);

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_key_key;
DROP INDEX IF EXISTS tags_key_key;
ALTER TABLE tags ADD CONSTRAINT tags_workspace_id_key_key UNIQUE (workspace_id, key);

-- customers.email — the delicate one. Since chatbot_ingest, email is NULLABLE
-- (an anonymous visitor has none) and uniqueness lives in a PARTIAL index rather
-- than a constraint. Both properties must survive: the predicate is preserved
-- verbatim so NULL-email visitors stay absent from the index and get their
-- uniqueness solely from customers_visitor_unique_idx, and email is citext so
-- per-workspace uniqueness stays case-insensitive. Partial means it cannot be a
-- table constraint, which is why Prisma cannot see it.
DROP INDEX customers_email_unique_idx;
CREATE UNIQUE INDEX customers_email_unique_idx
  ON customers (workspace_id, email) WHERE email IS NOT NULL;

-- DELIBERATELY UNTOUCHED, all four, and the reasoning is the same for the first
-- three: an api_key belongs to exactly one workspace and a ticket belongs to
-- exactly one workspace, so these keys are STRICTLY NARROWER than the
-- per-workspace versions. Adding workspace_id would replace a strong constraint
-- with a weaker one that says less.
--   customers_visitor_unique_idx            (visitor_api_key_id, visitor_ref)
--   ticket_messages_external_ref_unique_idx (ticket_id, external_ref)
--   chat_sessions_key_ref_unique_idx        (api_key_id, session_ref)
--   customers_identity_check — a VALIDITY constraint, not a uniqueness one. The
--     whole point of 20260801190000 was separating those two concerns; tenancy
--     does not re-conflate them.


-- ============================================================================
-- 15. identity_audit_log
--
-- Events about a HUMAN rather than about a workspace: sign-in, failed sign-in,
-- password reset, email change, account deactivation. There is no workspace to
-- attribute them to, and both alternatives are worse — a nullable workspace_id
-- on audit_log makes those rows write-only, and a sentinel "platform workspace"
-- would be swept by the SLA fan-out and exported like a real tenant and would
-- need an is_platform filter at every iteration site forever.
--
-- The runtime can APPEND and CANNOT READ. That is stronger than any policy: a
-- table with no SELECT grant for plumo_app cannot leak across tenants because
-- the role serving tenant requests cannot read it at all.
--
-- STARTS EMPTY ON PURPOSE. Every one of the ~20 existing audit.write call sites
-- is a tenant entity, and src/auth/auth.service.ts does not audit at all. So the
-- split costs nothing today; this is the destination for the auth events that
-- should be recorded and currently are not, and its existence is what stops
-- someone reaching for a nullable workspace_id six months from now.
-- ============================================================================

CREATE TABLE identity_audit_log (
  id          bigserial   PRIMARY KEY,
  actor_type  text        NOT NULL,   -- user | system
  actor_id    uuid,
  entity_type text        NOT NULL,   -- user | refresh_token | password_reset
  entity_id   uuid        NOT NULL,
  action      text        NOT NULL,   -- login | login.failed | password.reset | email.change | account.deactivate
  diff_json   jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_audit_log_entity_idx ON identity_audit_log (entity_type, entity_id);
CREATE INDEX identity_audit_log_actor_idx  ON identity_audit_log (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX identity_audit_log_created_at_idx ON identity_audit_log (created_at DESC);

-- roles.sql ran `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE,
-- DELETE ON TABLES TO plumo_app`, so this table arrives fully readable. Take it
-- back. NOTE: roles.sql's unconditional blanket GRANT will re-grant SELECT the
-- next time anyone re-runs it — see the roles.sql amendment in app changes; the
-- RLS below is the second line of defence precisely because that WILL happen.
REVOKE ALL    ON TABLE    identity_audit_log         FROM plumo_app;
GRANT  INSERT ON TABLE    identity_audit_log         TO   plumo_app;
GRANT  USAGE  ON SEQUENCE identity_audit_log_id_seq  TO   plumo_app;

-- With RLS enabled and no policy at all, every statement including INSERT is
-- denied — so the insert-only policy must ship in the same migration as the
-- ENABLE. This is the ONE policy in this migration; it has nothing to do with
-- workspace binding, which is why it is here and not in Phase 3.
ALTER TABLE identity_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY identity_audit_log_append_only ON identity_audit_log
  FOR INSERT TO plumo_app WITH CHECK (true);

COMMENT ON TABLE identity_audit_log IS
  'Identity-plane audit. APPEND-ONLY for plumo_app: no SELECT grant and no SELECT '
  'policy, by design. THEREFORE the application MUST write it with $executeRaw and no '
  'RETURNING — Prisma create() always emits INSERT ... RETURNING, which requires SELECT '
  'privilege AND a permissive SELECT policy and would fail with 42501.';


-- ============================================================================
-- 16. INDEXES
--
-- Two jobs at once, and both matter:
--   (a) every query the console runs must lead with workspace_id, so a tenant's
--       scan does not walk another tenant's index entries;
--   (b) every COMPOSITE FK needs an index on the REFERENCING side. PostgreSQL
--       creates one for the referenced side and none at all for the referencing
--       side, so without these every parent delete is a sequential scan of the
--       child — invisible on Monday's empty tables and a production incident
--       later. Assertion (7) below fails the migration if any is missing, which
--       is why they are all created HERE rather than split across phases.
--
-- Names follow Prisma's <table>_<col>_<col>_idx convention so the corresponding
-- @@index([workspaceId, ...]) declarations produce no drift.
-- ============================================================================

-- ---- customers -------------------------------------------------------------
DROP INDEX customers_organization_id_idx;
CREATE INDEX customers_workspace_id_organization_id_idx
  ON customers (workspace_id, organization_id);
CREATE INDEX customers_workspace_id_visitor_api_key_id_idx
  ON customers (workspace_id, visitor_api_key_id) WHERE visitor_api_key_id IS NOT NULL;

-- ---- teams / business_hours / sla_policies ---------------------------------
-- teams and business_hours are covered for the workspaces RESTRICT check by
-- their UNIQUE (workspace_id, id), which leads with workspace_id.
CREATE INDEX sla_policies_workspace_id_business_hours_id_idx
  ON sla_policies (workspace_id, business_hours_id);
-- SlaService.policyForPriority is per-workspace after the app fix; this is the
-- index that makes it cheap and the one that stops it seq-scanning every tenant.
CREATE INDEX sla_policies_workspace_id_priority_idx
  ON sla_policies (workspace_id, priority) WHERE is_active;

-- ---- tickets ---------------------------------------------------------------
DROP INDEX tickets_status_idx;
CREATE INDEX tickets_workspace_id_status_idx ON tickets (workspace_id, status);

DROP INDEX tickets_assignee_id_idx;
CREATE INDEX tickets_workspace_id_assignee_id_idx ON tickets (workspace_id, assignee_id);

DROP INDEX tickets_team_id_idx;
CREATE INDEX tickets_workspace_id_team_id_idx ON tickets (workspace_id, team_id);

DROP INDEX tickets_first_response_due_at_idx;
CREATE INDEX tickets_workspace_id_first_response_due_at_idx
  ON tickets (workspace_id, first_response_due_at);

-- THE IMPORTANT ONE. Backs the default inbox ordering AND the cursor pagination
-- tiebreaker. Both DESC directions preserved: a btree can be walked backwards so
-- ASC/ASC would technically serve the sort, but only as a backward scan, and it
-- would not match the Prisma @@index declaration so it would read as drift
-- forever.
DROP INDEX tickets_updated_at_id_idx;
CREATE INDEX tickets_workspace_id_updated_at_id_idx
  ON tickets (workspace_id, updated_at DESC, id DESC);

CREATE INDEX tickets_workspace_id_customer_id_idx     ON tickets (workspace_id, customer_id);
CREATE INDEX tickets_workspace_id_organization_id_idx ON tickets (workspace_id, organization_id);
CREATE INDEX tickets_workspace_id_sla_policy_id_idx   ON tickets (workspace_id, sla_policy_id);

DROP INDEX tickets_created_by_api_key_id_idx;
CREATE INDEX tickets_workspace_id_created_by_api_key_id_idx
  ON tickets (workspace_id, created_by_api_key_id) WHERE created_by_api_key_id IS NOT NULL;

DROP INDEX tickets_awaiting_handoff_idx;
CREATE INDEX tickets_workspace_id_awaiting_handoff_idx
  ON tickets (workspace_id, handed_off_at) WHERE created_by_api_key_id IS NOT NULL;

-- ONE sweep index, workspace-leading, because the worker fan-out is now a
-- decision and not an option: under Phase-3 RLS an unbound job sees zero rows in
-- every table, so an instance-wide sweep cannot exist. The predicate is a literal
-- transcription of SlaSweepProcessor's candidate query, so the index holds only
-- rows that are still SLA-relevant — a few per tenant rather than every ticket
-- ever filed. It also serves IntegrationsService.metrics()'s breachingFirstResponse
-- count, which has the identical shape. Per-tenant batching additionally fixes a
-- live fairness bug: today one tenant's backlog can consume the global take:500
-- and starve everyone else's SLA alerts.
CREATE INDEX tickets_sla_sweep_idx
  ON tickets (workspace_id, first_response_due_at)
  WHERE status IN ('new','open')
    AND sla_paused_at IS NULL
    AND first_responded_at IS NULL
    AND first_response_due_at IS NOT NULL;

-- ---- ticket_messages -------------------------------------------------------
DROP INDEX ticket_messages_ticket_id_created_at_idx;
CREATE INDEX ticket_messages_workspace_id_ticket_id_created_at_idx
  ON ticket_messages (workspace_id, ticket_id, created_at);

DROP INDEX ticket_messages_email_message_id_idx;
CREATE INDEX ticket_messages_workspace_id_email_message_id_idx
  ON ticket_messages (workspace_id, email_message_id);

CREATE INDEX ticket_messages_workspace_id_author_api_key_id_idx
  ON ticket_messages (workspace_id, author_api_key_id) WHERE author_api_key_id IS NOT NULL;

-- ---- attachments -----------------------------------------------------------
-- attachments had NO index at all beyond its PK. Every `include: { attachments:
-- true }` was a sequential scan and every ticket delete cascaded through one.
-- The composite FK makes that scan part of the constraint check, so this stops
-- being an optimisation and becomes load-bearing. NOT partial: it is also the
-- only index serving the workspaces RESTRICT probe on this table.
CREATE INDEX attachments_workspace_id_ticket_message_id_idx
  ON attachments (workspace_id, ticket_message_id);

-- Pending uploads are now per-tenant garbage, so a per-tenant reaper is possible.
-- (The reaper does not exist yet — see risks.)
CREATE INDEX attachments_pending_idx
  ON attachments (workspace_id, created_at) WHERE ticket_message_id IS NULL;

-- ---- tags / canned_responses / api_keys / webhooks -------------------------
-- tags is covered by tags_workspace_id_key_key.
CREATE INDEX canned_responses_workspace_id_team_id_idx    ON canned_responses (workspace_id, team_id);
CREATE INDEX canned_responses_workspace_id_created_by_idx ON canned_responses (workspace_id, created_by);

DROP INDEX api_keys_team_id_idx;
CREATE INDEX api_keys_workspace_id_team_id_idx    ON api_keys (workspace_id, team_id);
CREATE INDEX api_keys_workspace_id_created_by_idx ON api_keys (workspace_id, created_by);

CREATE INDEX webhook_deliveries_workspace_id_webhook_id_idx
  ON webhook_deliveries (workspace_id, webhook_id);

-- ---- chat_sessions ---------------------------------------------------------
-- chat_sessions_key_ref_unique_idx leads with api_key_id, not workspace_id, so
-- it cannot serve the (workspace_id, api_key_id) composite FK.
CREATE INDEX chat_sessions_workspace_id_api_key_id_idx ON chat_sessions (workspace_id, api_key_id);
DROP INDEX chat_sessions_ticket_id_idx;
CREATE INDEX chat_sessions_workspace_id_ticket_id_idx  ON chat_sessions (workspace_id, ticket_id);

-- ---- notifications ---------------------------------------------------------
DROP INDEX notifications_user_id_created_at_idx;
-- Serves the console list, the composite membership FK (leading two columns
-- (workspace_id, user_id)) AND the workspaces RESTRICT probe, in one non-partial
-- index.
CREATE INDEX notifications_workspace_id_user_id_created_at_idx
  ON notifications (workspace_id, user_id, created_at DESC);
CREATE INDEX notifications_workspace_id_ticket_id_idx
  ON notifications (workspace_id, ticket_id) WHERE ticket_id IS NOT NULL;
-- The unread badge is polled on every page render; partial keeps it tiny.
CREATE INDEX notifications_unread_idx
  ON notifications (workspace_id, user_id) WHERE read_at IS NULL;

-- ---- audit_log -------------------------------------------------------------
DROP INDEX audit_log_entity_type_entity_id_idx;
CREATE INDEX audit_log_workspace_id_entity_type_entity_id_idx
  ON audit_log (workspace_id, entity_type, entity_id);

DROP INDEX audit_log_created_at_idx;
CREATE INDEX audit_log_workspace_id_created_at_idx
  ON audit_log (workspace_id, created_at DESC);

-- /audit?actorId= has no index behind it today and never did.
-- NOTE: actor_id is polymorphic — it holds a USER id or an API-KEY id, and only
-- actor_type discriminates. Deliberately no FK, and the app must filter on both.
CREATE INDEX audit_log_workspace_id_actor_idx
  ON audit_log (workspace_id, actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

-- ---- webhooks --------------------------------------------------------------
-- covered by webhooks_workspace_id_id_key.

-- ---- the two GIN indexes ---------------------------------------------------
--
-- A correction to the premise in an earlier migration header: a multicolumn GIN
-- has NO leading column. Unlike a btree it builds one entry space of
-- (column_number, key) pairs with no ordering across columns; a two-predicate
-- query performs two independent posting-list lookups and bitmap-ANDs them.
--
-- What that buys: other tenants' TIDs are discarded INSIDE the index scan,
-- before any heap fetch. With a plain GIN(tags), a query for tag 'billing'
-- heap-fetches every match in every workspace and only then filters — slower,
-- and it drags other tenants' heap pages through shared_buffers.
--
-- What it does NOT buy: isolation. The posting list still physically contains
-- other tenants' TIDs. RLS is the only thing enforcing separation.
--
-- What it costs: every ticket contributes a workspace_id entry, so with 2-5
-- tenants you get a handful of enormous posting lists that filter almost nothing
-- while costing storage and GIN pending-list churn. This form is roughly neutral
-- to slightly negative at launch scale and clearly right at 100+ tenants.
--
-- So the argument is TIMING, not theory: changing a GIN later means CREATE INDEX
-- CONCURRENTLY on a large hot table; today the table has zero rows and both forms
-- cost the same nothing. Watch pg_stat_user_indexes; the remedy if tenant
-- distribution turns out to be one dominant workspace plus a long tail is a
-- CONCURRENTLY rebuild back to plain GIN.
--
-- Opclasses are spelled explicitly even though btree_gin registers them as
-- defaults, because the failure mode without btree_gin is a confusing "data type
-- uuid has no default operator class for access method gin".

-- Plain GIN, not multicolumn. btree_gin would let workspace_id lead inside the
-- GIN itself, which wins when there are many comparable tenants and the planner
-- must exclude most of them. With a handful of workspaces and one dominant, the
-- tenant predicate excludes almost nothing, so the extra key only enlarges every
-- posting list and slows maintenance. btree_gin stays installed: swapping to the
-- multicolumn form later is two CREATE INDEX statements against a bigger table.
-- The workspace_id btree created above carries the tenant predicate.
DROP INDEX IF EXISTS tickets_tags_idx;
CREATE INDEX tickets_tags_idx ON tickets USING GIN (tags);

-- Name deliberately unchanged: it is invisible to the Prisma schema anyway, and
-- the CI allowlist and the assertions below reference it by this name. The
-- DEFINITION changed, and assertion (2) checks it has two columns rather than
-- merely existing.
DROP INDEX IF EXISTS tickets_search_tsv_idx;
CREATE INDEX tickets_search_tsv_idx ON tickets USING GIN (search_tsv);

-- ---- MUST NOT CHANGE, and why ----------------------------------------------
--   api_keys_key_prefix_idx (key_prefix) — the PRE-TENANT lookup. Authenticating
--     an API key is what DETERMINES the workspace, so it necessarily runs before
--     any workspace is bound. A workspace-leading index would be unusable there.
--   refresh_tokens_user_id_idx, password_resets_user_id_idx, users_email_key —
--     global identity tables, which by locked decision never get workspace_id.
--   chat_sessions_key_ref_unique_idx, customers_visitor_unique_idx,
--     ticket_messages_external_ref_unique_idx — strictly narrower already.


-- ============================================================================
-- 17. THE BOOTSTRAP FUNCTIONS
--
-- NestJS runs middleware -> GUARDS -> INTERCEPTORS -> pipes -> handler. AuthGuard
-- builds the Principal, so the api-key lookup and the workspace/membership
-- resolution happen BEFORE any interceptor can open a transaction and bind a
-- workspace. That is not a bug to be designed around; it is the framework, and it
-- means those three lookups run on an UNBOUND pooled connection forever.
--
-- If Phase 3 gave api_keys / workspaces / workspace_memberships ordinary
-- workspace_id policies, every API key would 401 and every human would 403.
-- These SECURITY DEFINER functions are the answer: the bootstrap path goes
-- through them, and Phase 3 can then write strict policies on the underlying
-- tables with no fail-open exception.
--
-- PHASE 3 CONSTRAINT, and it is absolute: `workspaces`, `workspace_memberships`
-- and `api_keys` must NOT be given FORCE ROW LEVEL SECURITY. These functions run
-- as plumo_migrator, which owns those tables, and a table owner is exempt from
-- its own policies ONLY in the absence of FORCE. Add FORCE and every bind fails
-- and the entire API stops. plumo_app is not the owner, so plain RLS still binds
-- it completely — nothing is lost.
-- ============================================================================

-- Existence/lifecycle check, hardened. SECURITY DEFINER so the runtime never
-- needs SELECT on `workspaces`.
CREATE FUNCTION app_workspace_is_active(p_workspace_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = p_workspace_id AND w.status = 'active')
$$;

-- Binds the tenant for the current transaction.
--
-- THIS FUNCTION MUST NOT CARRY A `SET` CLAUSE, and that is the single subtlest
-- thing in this file. A function with a proconfig entry runs inside a NEW GUC
-- nest level; on exit fmgr calls AtEOXact_GUC(true, save_nestlevel), which pops
-- every GUC stack entry at or above that level — not merely the variables named
-- in the SET clause. The transaction-local binding would therefore be discarded
-- the instant the function returned, silently, and every request would run
-- unbound: NOT NULL violations on every write, zero rows on every read. Fail
-- closed, but a total and confusingly-diagnosed outage.
--
-- The hardened search_path lives on app_workspace_is_active above, which does the
-- only table access. This function is SECURITY INVOKER and touches nothing but
-- pg_catalog.set_config, so there is nothing to inject into.
--
-- Assertion (10) below CALLS this function and checks the binding survives, so a
-- future "hardening" that re-adds SET fails the migration rather than production.
CREATE FUNCTION app_set_workspace(p_workspace_id uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'app_set_workspace: workspace id must not be null'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  -- Raises rather than returning empty, so a worker that binds garbage gets an
  -- exception instead of a result set that looks like "no work to do".
  IF NOT public.app_workspace_is_active(p_workspace_id) THEN
    RAISE EXCEPTION 'app_set_workspace: workspace % is unknown or not active', p_workspace_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Transaction-local (third argument true), NEVER session-local: a session
  -- setting outlives the request on a pooled connection and hands the next
  -- caller this tenant's scope.
  PERFORM pg_catalog.set_config('app.workspace_id', p_workspace_id::text, true);
  RETURN p_workspace_id;
END
$$;

-- The unattended worker's tenant enumeration, and the only supported one.
-- Returns opaque ids only: no name, no slug, no counts.
CREATE FUNCTION app_active_workspaces() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT id FROM workspaces WHERE status = 'active' ORDER BY id
$$;

-- The API-key bootstrap. Replaces AuthGuard.verifyApiKey's direct
-- prisma.apiKey.findFirst, which under Phase-3 RLS would return nothing on an
-- unbound connection and 401 every chatbot request. Returns exactly the columns
-- the Principal needs and nothing else — no key_hash, no other tenant's rows.
-- Expiry is deliberately returned rather than filtered, so a partner whose
-- credential lapsed still gets a distinguishable message.
CREATE FUNCTION app_resolve_api_key(p_prefix text, p_hash text)
  RETURNS TABLE (id uuid, workspace_id uuid, team_id uuid, name text,
                 scopes text[], expires_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT k.id, k.workspace_id, k.team_id, k.name, k.scopes, k.expires_at
  FROM api_keys k
  WHERE k.key_prefix = p_prefix AND k.key_hash = p_hash AND k.is_active
$$;

-- The human bootstrap: resolve a workspace by slug and the caller's membership in
-- it, in one round trip, on the unbound connection the guard has. Returns nothing
-- if the workspace is unknown/suspended or the user is not a member — the guard
-- turns that into a 403.
CREATE FUNCTION app_resolve_membership(p_user_id uuid, p_slug citext)
  RETURNS TABLE (workspace_id uuid, membership_id uuid, role user_role,
                 team_id uuid, membership_active boolean, workspace_slug citext)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT w.id, m.id, m.role, m.team_id, m.is_active, w.slug
  FROM workspaces w
  JOIN workspace_memberships m ON m.workspace_id = w.id AND m.user_id = p_user_id
  WHERE w.slug = p_slug AND w.status = 'active'
$$;

-- The fire-and-forget usage stamp in verifyApiKey is an UPDATE on an unbound
-- connection; under Phase-3 RLS it would silently match zero rows.
CREATE FUNCTION app_touch_api_key(p_id uuid) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  UPDATE api_keys SET last_used_at = now() WHERE id = p_id
$$;

-- EXECUTE is granted to PUBLIC by default on a new function; for a SECURITY
-- DEFINER function that is the entire vulnerability, so revoke first.
REVOKE ALL ON FUNCTION app_current_workspace()                 FROM PUBLIC;
REVOKE ALL ON FUNCTION app_workspace_is_active(uuid)           FROM PUBLIC;
REVOKE ALL ON FUNCTION app_set_workspace(uuid)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION app_active_workspaces()                 FROM PUBLIC;
REVOKE ALL ON FUNCTION app_resolve_api_key(text, text)         FROM PUBLIC;
REVOKE ALL ON FUNCTION app_resolve_membership(uuid, citext)    FROM PUBLIC;
REVOKE ALL ON FUNCTION app_touch_api_key(uuid)                 FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_current_workspace()              TO plumo_app;
GRANT EXECUTE ON FUNCTION app_workspace_is_active(uuid)        TO plumo_app;
GRANT EXECUTE ON FUNCTION app_set_workspace(uuid)              TO plumo_app;
GRANT EXECUTE ON FUNCTION app_resolve_api_key(text, text)      TO plumo_app;
GRANT EXECUTE ON FUNCTION app_resolve_membership(uuid, citext) TO plumo_app;
GRANT EXECUTE ON FUNCTION app_touch_api_key(uuid)              TO plumo_app;

-- LAUNCH-DAY POSITION on the enumerator. Ideally this belongs to a third role
-- (plumo_worker: INHERIT, member of plumo_app, NOSUPERUSER NOBYPASSRLS) with its
-- own connection string, so a tenant request cannot enumerate tenants at all.
-- Granting it to plumo_app for launch leaks only "how many workspaces exist" —
-- no names, no slugs, no counts — and the upgrade is one REVOKE plus one GRANT
-- with no schema change and no downtime. Adding a third role means a new secret
-- to provision on the Friday before a Monday launch.
GRANT EXECUTE ON FUNCTION app_active_workspaces() TO plumo_app;

-- New tables. ALTER DEFAULT PRIVILEGES in roles.sql already covers these, but the
-- failure mode otherwise is a 500 on ticket creation in production and nowhere
-- earlier, so say it explicitly.
GRANT SELECT, INSERT, UPDATE, DELETE ON workspaces            TO plumo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_memberships TO plumo_app;

-- The runtime must not be able to delete a workspace. Belt and braces with the
-- ON DELETE RESTRICT above: RESTRICT stops the delete succeeding while data
-- exists; this stops the statement being issuable at all, including after a purge
-- job has emptied the tenant.
--
-- roles.sql's unconditional `GRANT ... ON ALL TABLES` will undo this on its next
-- run. The amendment is mandatory — see app changes.
REVOKE DELETE ON workspaces FROM plumo_app;


-- ============================================================================
-- 18. ASSERTIONS
--
-- These run inside the migration's own transaction. If anything above failed to
-- take effect, the RAISE rolls the WHOLE migration back and nothing half-applied
-- reaches disk. Every one of them fails if its corresponding step were skipped —
-- that is the point, and this project has already been bitten once by a check
-- that passed while enforcing nothing.
-- ============================================================================

DO $$
DECLARE
  bad text;
  n int;
  ws uuid;
  bound uuid;
BEGIN
  -- (1) every tenant table has workspace_id NOT NULL with the GUC default.
  --     Fails if the DEFAULT were a literal, or NOT NULL never applied — either
  --     of which means forgotten code writes into a real tenant silently.
  SELECT string_agg(t, ', ') INTO bad
  FROM unnest(ARRAY['organizations','customers','teams','business_hours','sla_policies',
                    'tickets','ticket_messages','tags','canned_responses','api_keys',
                    'webhooks','webhook_deliveries','chat_sessions',
                    'attachments','export_state','notifications','audit_log']) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name=t AND c.column_name='workspace_id'
      AND c.is_nullable='NO' AND c.column_default='app_current_workspace()');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenancy: workspace_id missing/nullable/undefaulted on: %', bad; END IF;

  -- (2) full-text search survived, and the GINs are two-column GINs.
  --     tgenabled='O' matters: ALTER TABLE ... DISABLE TRIGGER leaves the row in
  --     pg_trigger, so an existence-only check passes against a database where
  --     search indexing is silently dead. This is the exact failure that already
  --     happened once and went unnoticed, because BOTH consumers swallow it.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='tickets'
                   AND column_name='search_tsv' AND udt_name='tsvector') THEN
    RAISE EXCEPTION 'FTS: tickets.search_tsv is missing or not tsvector'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='tickets'::regclass
                   AND tgname='tickets_tsv_trigger' AND NOT tgisinternal AND tgenabled='O') THEN
    RAISE EXCEPTION 'FTS: tickets_tsv_trigger is missing or DISABLEd'; END IF;
  IF to_regprocedure('tickets_tsv_update()') IS NULL
     OR to_regprocedure('refresh_ticket_tsv(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FTS: a tsv function was destroyed'; END IF;
  -- Single-column GIN by decision: with a handful of workspaces and one dominant,
  -- a workspace_id-leading GIN only enlarges every posting list. The tenant
  -- predicate rides the workspace_id btree instead. Asserting indnatts=1 pins
  -- that choice, so switching to the multicolumn form is a deliberate edit here
  -- rather than something that drifts in unnoticed.
  FOR bad IN SELECT x FROM unnest(ARRAY['tickets_search_tsv_idx','tickets_tags_idx']) x
             WHERE NOT EXISTS (
               SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
                                        JOIN pg_am am ON am.oid=c.relam
               WHERE c.relname=x AND am.amname='gin' AND i.indisvalid AND i.indnatts=1)
  LOOP RAISE EXCEPTION '% is missing, not GIN, invalid, or not single-column', bad; END LOOP;

  -- The global uniques Prisma created as INDEXES, not constraints — so
  -- `ALTER TABLE ... DROP CONSTRAINT` is a silent no-op on them. If either
  -- survived, the second workspace could never create its first ticket or its
  -- first tag, because both number from 1.
  IF to_regclass('tickets_number_key') IS NOT NULL THEN
    RAISE EXCEPTION 'numbering: the GLOBAL unique tickets_number_key survived — '
                    'per-workspace numbering will collide across tenants'; END IF;
  IF to_regclass('tags_key_key') IS NOT NULL THEN
    RAISE EXCEPTION 'tags: the GLOBAL unique tags_key_key survived'; END IF;

  -- (3) NO single-column FK to a tenant parent survives. A survivor is a
  --     reference that is still satisfiable ACROSS workspaces.
  SELECT string_agg(conrelid::regclass || '.' || conname, ', ') INTO bad
  FROM pg_constraint
  WHERE contype='f' AND connamespace='public'::regnamespace AND cardinality(conkey)=1
    AND confrelid::regclass::text IN ('organizations','customers','teams','business_hours',
                                      'sla_policies','tickets','ticket_messages','webhooks','api_keys');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenancy: single-column FK to a tenant parent survives: %', bad; END IF;

  -- (4) every composite SET NULL FK carries a PG15 column list. Without it, the
  --     action would try to null workspace_id and every parent delete would fail
  --     with 23502 — the single most likely way to get this migration subtly
  --     wrong, and the way Prisma's own onDelete: SetNull would generate it.
  SELECT string_agg(conrelid::regclass || '.' || conname, ', ') INTO bad
  FROM pg_constraint
  WHERE contype='f' AND connamespace='public'::regnamespace AND confdeltype='n'
    AND cardinality(conkey)>1
    AND (confdelsetcols IS NULL OR cardinality(confdelsetcols)<>1);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenancy: composite SET NULL FK without a column list: %', bad; END IF;

  -- (5) users no longer carries tenant-scoped state. A surviving users.role is
  --     the cross-tenant privilege-escalation path, and RLS does not stop it
  --     because RLS filters rows, not authority.
  SELECT string_agg(column_name, ', ') INTO bad
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users'
    AND column_name IN ('team_id','role','availability');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenancy: users still has tenant-scoped column(s): %', bad; END IF;

  -- (6) every tenant-scoped table has its immutability trigger, ENABLED.
  --     Without it, one UPDATE moves a whole conversation into another tenant
  --     with every constraint satisfied.
  SELECT string_agg(t, ', ') INTO bad
  FROM unnest(ARRAY['organizations','customers','teams','business_hours','sla_policies',
                    'tickets','ticket_messages','tags','canned_responses','api_keys',
                    'webhooks','webhook_deliveries','chat_sessions','attachments',
                    'export_state','notifications','audit_log','workspace_memberships']) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass
      AND tgname=t||'_workspace_immutable' AND NOT tgisinternal AND tgenabled='O');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenancy: workspace_id immutability trigger missing/disabled on: %', bad; END IF;

  -- (7) every FOREIGN KEY in public has an index on the REFERENCING side whose
  --     leading columns POSITIONALLY match conkey. Postgres indexes only the
  --     referenced side, so a miss here is invisible on Monday's empty tables and
  --     a table-scan-per-delete later. Positional, not set-based: an index with
  --     the right columns in the wrong order does not serve the RI probe.
  SELECT string_agg(c.conrelid::regclass || '.' || c.conname, ', ') INTO bad
  FROM pg_constraint c
  WHERE c.contype='f' AND c.connamespace='public'::regnamespace
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid AND i.indisvalid
        AND i.indnkeyatts >= cardinality(c.conkey)
        AND (SELECT array_agg(k ORDER BY ord)
             FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS u(k, ord)
             WHERE ord <= cardinality(c.conkey)) = c.conkey);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenancy: FK with no matching referencing-side index: %', bad; END IF;

  -- (8) every workspaces FK additionally has a NON-PARTIAL index leading with
  --     workspace_id. A partial index cannot serve the bare `workspace_id = $1`
  --     RESTRICT probe when its predicate is not implied.
  SELECT string_agg(c.conrelid::regclass::text, ', ') INTO bad
  FROM pg_constraint c
  WHERE c.contype='f' AND c.connamespace='public'::regnamespace
    AND c.confrelid='workspaces'::regclass
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i JOIN pg_attribute a
        ON a.attrelid=i.indrelid AND a.attnum=(i.indkey::smallint[])[0]
      WHERE i.indrelid=c.conrelid AND i.indisvalid AND i.indpred IS NULL
        AND a.attname='workspace_id');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenancy: workspaces FK with no plain workspace_id-leading index on: %', bad; END IF;

  -- (9) numbering. The sequence is gone, nothing defaults to nextval, the
  --     trigger exists and is ENABLED, and the CHECK is in place.
  IF to_regclass('ticket_number_seq') IS NOT NULL THEN
    RAISE EXCEPTION 'numbering: ticket_number_seq still exists'; END IF;
  SELECT count(*) INTO n FROM pg_attrdef d JOIN pg_attribute a
    ON a.attrelid=d.adrelid AND a.attnum=d.adnum
   WHERE d.adrelid='tickets'::regclass AND a.attname='number'
     AND pg_get_expr(d.adbin, d.adrelid) LIKE '%nextval%';
  IF n <> 0 THEN RAISE EXCEPTION 'numbering: tickets.number still defaults to a sequence'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='tickets'::regclass
                   AND tgname='tickets_number_trigger' AND NOT tgisinternal AND tgenabled='O') THEN
    RAISE EXCEPTION 'numbering: tickets_number_trigger missing or DISABLEd'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='tickets'::regclass
                   AND conname='tickets_number_positive_check') THEN
    RAISE EXCEPTION 'numbering: tickets_number_positive_check is missing'; END IF;

  -- (10) BEHAVIOURAL: app_set_workspace actually binds, and the binding survives
  --      the function's return. This is the assertion that catches a `SET`
  --      clause being added to that function — the failure that would otherwise
  --      surface as every request running unbound in production.
  SELECT id INTO ws FROM workspaces ORDER BY created_at LIMIT 1;
  IF ws IS NULL THEN
    RAISE EXCEPTION 'tenancy: no bootstrap workspace exists — section 5 did not run'; END IF;
  PERFORM app_set_workspace(ws);
  bound := app_current_workspace();
  IF bound IS DISTINCT FROM ws THEN
    RAISE EXCEPTION
      'app_set_workspace did not bind (got %, expected %). A SET clause on that function '
      'pops the GUC stack on exit.', bound, ws; END IF;
  -- and unwind, so nothing later in this transaction runs bound
  PERFORM set_config('app.workspace_id', '', true);
  IF app_current_workspace() IS NOT NULL THEN
    RAISE EXCEPTION 'app_current_workspace() did not NULLIF the empty string — every write '
                    'on a pooled connection would fail with "invalid input syntax for uuid"'; END IF;

  -- (11) volatility and parallel safety. 'i' (IMMUTABLE) means one tenant's id
  --      can be folded into a cached plan and served to another — silent and
  --      catastrophic. A proconfig entry means no inlining under RLS.
  SELECT string_agg(proname, ', ') INTO bad FROM pg_proc
  WHERE proname='app_current_workspace' AND (provolatile<>'s' OR proparallel<>'s' OR proconfig IS NOT NULL);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'app_current_workspace() has wrong volatility/parallel/config markings'; END IF;

  -- (12) the runtime cannot delete a workspace, and cannot read the identity log.
  IF has_table_privilege('plumo_app','public.workspaces','DELETE') THEN
    RAISE EXCEPTION 'plumo_app can still DELETE a workspace'; END IF;
  IF has_table_privilege('plumo_app','identity_audit_log','SELECT') THEN
    RAISE EXCEPTION 'plumo_app can SELECT identity_audit_log'; END IF;
  IF NOT has_table_privilege('plumo_app','identity_audit_log','INSERT') THEN
    RAISE EXCEPTION 'plumo_app cannot INSERT identity_audit_log; auth auditing would fail'; END IF;

  -- (13) the bootstrap tenant exists with an admin membership, or nobody can log
  --      in usefully after this migration.
  IF NOT EXISTS (SELECT 1 FROM workspace_memberships m
                 WHERE m.role='admin' AND m.is_active) THEN
    RAISE EXCEPTION 'tenancy: bootstrap workspace has no active admin membership'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE is_platform_admin) THEN
    RAISE EXCEPTION 'tenancy: no platform admin — nobody can create the second workspace'; END IF;

  -- (14) sessions were actually invalidated. A surviving refresh token backs an
  --      access token carrying role and teamId claims whose meaning just changed.
  IF EXISTS (SELECT 1 FROM refresh_tokens) THEN
    RAISE EXCEPTION 'tenancy: refresh_tokens survived the wipe'; END IF;

  -- (14b) NOTHING WAS ORPHANED BY THE BACKFILL.
  --      workspace_id is NOT NULL on every tenant table, so a row without one
  --      cannot exist — but a row adopted by the WRONG workspace can, and a
  --      count of zero here would mean the migration silently dropped the
  --      desk's history instead of adopting it. Assert the rows are still
  --      present and all belong to the single bootstrap workspace.
  IF (SELECT count(*) FROM workspaces) <> 1 THEN
    RAISE EXCEPTION 'tenancy: expected exactly one bootstrap workspace, found %',
      (SELECT count(*) FROM workspaces); END IF;

  -- every tenant row points at the one workspace that exists
  IF EXISTS (
    SELECT 1 FROM tickets t
    WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = t.workspace_id)
  ) THEN
    RAISE EXCEPTION 'tenancy: some tickets reference a workspace that does not exist'; END IF;

  RAISE NOTICE 'tenancy: % ticket(s), % message(s), % customer(s) adopted',
    (SELECT count(*) FROM tickets),
    (SELECT count(*) FROM ticket_messages),
    (SELECT count(*) FROM customers);

  -- (15) the hand-written-SQL defaults are in place. Without them the seed and
  --      the verify script die on their first INSERT.
  SELECT string_agg(t, ', ') INTO bad
  FROM unnest(ARRAY['organizations','customers','users','teams','business_hours',
                    'sla_policies','tickets','tags','canned_responses','webhooks']) AS t
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=t
                      AND c.column_name='updated_at' AND c.column_default IS NOT NULL);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenancy: updated_at has no default on: % — raw SQL inserts will fail', bad; END IF;
END $$;


-- ============================================================================
-- NOT IN THIS MIGRATION, by design — recorded so nothing falls between phases:
--
--   * ROW-LEVEL SECURITY (Phase 3). Every policy, FORCE ROW LEVEL SECURITY on
--     every tenant table EXCEPT workspaces / workspace_memberships / api_keys
--     (see section 17), and the interceptor that opens the transaction and calls
--     app_set_workspace(). UNTIL THAT LANDS, NOTHING ENFORCES ISOLATION ON READS:
--     the composite FKs stop cross-workspace references and the triggers stop
--     migrations between tenants, but `SELECT * FROM tickets` on an unbound
--     connection returns every tenant's rows. That is why the app changes below
--     add explicit workspaceId filters NOW rather than waiting.
--   * The Phase-3 bootstrap path is already solved: guards call
--     app_resolve_api_key / app_resolve_membership, so no table needs a fail-open
--     policy.
--   * Per-workspace ticket-number resolution for INBOUND EMAIL. Both threading
--     paths are cross-tenant ambiguous. workspaces.inbound_email exists; the
--     application work does not.
--   * A workspace purge job. ON DELETE RESTRICT means there is currently NO way
--     to delete a workspace at all. That is the correct trade — accidental
--     deletion is worse than absent deletion — but it is an unimplemented
--     operational path and the first offboarding request surfaces it.
--   * A pending-attachment reaper. attachments_pending_idx makes it cheap; it
--     does not exist.
--   * ticket_messages.author_id — still a polymorphic uuid (user OR customer)
--     with no FK. The fix is splitting it into author_user_id (composite FK to
--     memberships) and author_customer_id (composite FK to customers) with a
--     CHECK that exactly one is set. Cheap now while the table is empty,
--     expensive later. Flagged rather than silently left.
-- ============================================================================