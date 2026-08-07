-- Invitations — the missing half of "add somebody to this desk".
--
-- Until now the only way onto a workspace was POST /users, which takes a
-- password an admin chooses ON THE OTHER PERSON'S BEHALF and mails to them out
-- of band, or PM sign-in, which only seats people who already administer the
-- linked Plumo workspace. Neither works for "invite a tester next week", and the
-- console's invite button was wired to a mock that showed a toast and made no
-- request at all.
--
-- THE ONE HARD PROBLEM THIS TABLE HAS, and the reason most of this file exists:
-- the accept flow is unauthenticated. A stranger holding a link has no token, no
-- membership and therefore no workspace — the whole point is that they are not a
-- member yet. But `invitations` is tenant data and carries workspace_id, so it
-- gets the workspace_isolation policy like everything else, and under that
-- policy an unbound SELECT matches ZERO ROWS. Looking a token up directly would
-- not error; it would silently find nothing, and every invitation link in the
-- world would report "this link is not valid".
--
-- That is the same shape as the login bootstrap, and it gets the same answer:
-- app_resolve_invitation() below is SECURITY DEFINER, runs as the table owner,
-- and returns exactly the columns the accept page needs. Once it has told the
-- caller WHICH workspace, the caller binds it with app_set_workspace and every
-- subsequent write — the membership, the accepted stamp, the audit row — runs
-- under the ordinary policy with no exception carved out.

-- ============================================================================
-- 1. THE TABLE
--
-- Shaped after password_resets (hash only, an expiry, a single-use stamp) but
-- tenant-scoped, which password_resets is not: a reset is about a person and a
-- person is global, while an invitation is about a SEAT and a seat belongs to
-- exactly one desk.
-- ============================================================================

CREATE TABLE invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Same default as every other tenant table: filled from the transaction
  -- binding, never passed by the application. Creating an invitation happens
  -- inside an authenticated, workspace-bound request, so this resolves; a code
  -- path that forgets to bind writes NULL and dies on the NOT NULL rather than
  -- landing in an arbitrary desk.
  workspace_id  uuid NOT NULL DEFAULT app_current_workspace(),

  -- citext, matching users.email. The address is the identity of the invitee
  -- before they have an account, and "Bob@corp.com" must resolve to the same
  -- human as "bob@corp.com" — both at accept time and for the pending-uniqueness
  -- index below, which relies on this type for its case folding.
  email         citext NOT NULL,

  -- The role the invitee lands with. Not a suggestion — accept() writes exactly
  -- this into the membership, so an admin has to choose deliberately.
  role          user_role NOT NULL DEFAULT 'agent',

  team_id       uuid,

  -- SHA-256 OF THE TOKEN, NEVER THE TOKEN. Same rule as password_resets and
  -- api_keys: the plaintext exists in memory for the length of one request and
  -- in the recipient's mailbox, and nowhere else. An admin reading this table —
  -- or a database backup, or a support session — cannot mint a session as the
  -- person they invited.
  --
  -- text, not bytea: 64 hex characters, compared for equality only, and the
  -- application already hashes to hex everywhere else (auth.service.sha256).
  token_hash    text NOT NULL,

  -- Who is answerable for this seat existing.
  invited_by    uuid NOT NULL,

  expires_at    timestamptz NOT NULL,

  -- Single use. Set once, by the atomic claim in InvitationsService.accept:
  -- `UPDATE ... WHERE id = $1 AND accepted_at IS NULL` returning one row is what
  -- makes two simultaneous clicks on the same link resolve to one membership and
  -- one loud refusal, rather than to a race decided by whichever transaction
  -- committed second.
  accepted_at   timestamptz,

  -- Which account claimed it. NO FOREIGN KEY, deliberately: the natural target
  -- would be workspace_memberships (workspace_id, user_id), but this column is
  -- written in the same transaction that creates that membership, so a
  -- non-deferrable FK would fail on ordering for no benefit. It is a record of
  -- what happened, not a live reference.
  accepted_by   uuid,

  revoked_at    timestamptz,
  revoked_by    uuid,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invitations_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Composite, like every other tenant->tenant reference: an invitation in
  -- workspace A can only name a team whose workspace_id is also A. The
  -- column-list SET NULL form is mandatory here rather than stylistic — the
  -- plain form would try to null workspace_id too and raise a not-null violation
  -- at DELETE time.
  CONSTRAINT invitations_team_id_fkey
    FOREIGN KEY (workspace_id, team_id) REFERENCES teams (workspace_id, id)
    ON UPDATE CASCADE ON DELETE SET NULL (team_id),

  -- The inviter must be a member of the workspace they are inviting into, and
  -- that is now structural rather than an application check. RESTRICT for the
  -- same reason canned_responses.created_by does: authorship is historical, so
  -- deactivation (is_active = false) stays the offboarding path and the trail of
  -- who invited whom survives it.
  CONSTRAINT invitations_invited_by_fkey
    FOREIGN KEY (workspace_id, invited_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  -- An invitation cannot be both accepted and revoked. The service revokes only
  -- rows that are neither, but this is the backstop that keeps the four states
  -- the application reasons about (pending / expired / accepted / revoked)
  -- genuinely exclusive rather than merely usually so.
  CONSTRAINT invitations_terminal_state_exclusive
    CHECK (accepted_at IS NULL OR revoked_at IS NULL),

  -- accepted_by is meaningful only alongside accepted_at.
  CONSTRAINT invitations_accepted_by_present
    CHECK ((accepted_at IS NULL) = (accepted_by IS NULL))
);

-- GLOBALLY unique, not per workspace, and that is forced by the lookup: the
-- accept page presents a token and nothing else — no slug, no session, no
-- workspace — so the hash has to identify a row on its own. This is also the
-- index app_resolve_invitation reads.
CREATE UNIQUE INDEX invitations_token_hash_key ON invitations (token_hash);

-- ONE OUTSTANDING INVITATION PER ADDRESS PER DESK.
--
-- Re-inviting somebody must REPLACE their pending invitation, not add a second:
-- two live tokens for one seat means revoking the one you can see leaves the
-- other working, which is a revocation that does not revoke. The service revokes
-- the old row before inserting the new one; this index is what makes that
-- ordering mandatory instead of merely intended, and what makes two admins
-- inviting the same person at the same moment collide loudly.
--
-- Deliberately NOT filtered on expires_at: an expired-but-unrevoked row still
-- occupies the slot, so re-inviting after an expiry must revoke it first. That
-- is the same code path, and it keeps the predicate immutable — a NOW() in an
-- index predicate is not indexable at all.
--
-- Invisible to schema.prisma (partial indexes cannot be expressed), like
-- customers_email_unique_idx. `prisma migrate diff` will propose dropping it.
CREATE UNIQUE INDEX invitations_pending_email_key
  ON invitations (workspace_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- The Settings list: this desk's invitations, newest first.
CREATE INDEX invitations_workspace_id_created_at_idx
  ON invitations (workspace_id, created_at DESC);

COMMENT ON TABLE invitations IS
  'A pending seat on a desk. Token stored as sha256 only; single use; 7-day expiry. '
  'Read on the unauthenticated accept path through app_resolve_invitation(), which is '
  'SECURITY DEFINER because an unbound SELECT under workspace_isolation returns nothing.';
COMMENT ON COLUMN invitations.token_hash IS
  'sha256 of the 32 random bytes emailed to the invitee. The plaintext is never stored.';

-- workspace_id is immutable, on this table as on the other nineteen. Moving an
-- invitation between desks would silently re-point the seat it grants.
CREATE TRIGGER invitations_workspace_immutable
  BEFORE UPDATE OF workspace_id ON invitations
  FOR EACH ROW EXECUTE FUNCTION deny_workspace_change();


-- ============================================================================
-- 2. ROW-LEVEL SECURITY
--
-- Verbatim the policy the Phase-3 migration installs on every table carrying
-- workspace_id. That migration DERIVES its table list at run time rather than
-- listing it, so a table added later is impossible to miss — but only if the
-- migration is re-run, and it is not. Written out here so this table is covered
-- from the moment it exists.
-- ============================================================================

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_isolation ON invitations;
CREATE POLICY workspace_isolation ON invitations
  USING (workspace_id = app_current_workspace())
  WITH CHECK (workspace_id = app_current_workspace());


-- ============================================================================
-- 3. THE UNBOUND LOOKUP
--
-- GET /invitations/token/:token and POST /invitations/token/:token/accept are
-- @Public. AuthGuard does not run, so no principal exists, so
-- WorkspaceBindingInterceptor opens no transaction and binds no workspace —
-- app_current_workspace() is NULL and the policy above yields nothing.
--
-- SECURITY DEFINER, for exactly the reason app_resolve_membership and
-- app_resolve_sole_membership are: this is a bootstrap read that must happen
-- BEFORE the tenant is known, because discovering the tenant is what it is for.
--
-- It returns the invitation and its workspace and NOTHING ELSE — no token hash
-- back out, no other row, no way to enumerate. The argument is a sha256 digest,
-- so the only way to name a row is to already hold the token that produced it.
-- ============================================================================

CREATE FUNCTION app_resolve_invitation(p_token_hash text)
  RETURNS TABLE (invitation_id uuid, workspace_id uuid, workspace_slug citext,
                 workspace_name text, workspace_active boolean, email citext,
                 role user_role, team_id uuid, invited_by uuid,
                 expires_at timestamptz, accepted_at timestamptz,
                 revoked_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  -- Every column reference is table-qualified. In a SQL-language function the
  -- RETURNS TABLE names are in scope as parameters, so a bare `email` or `role`
  -- here is ambiguous and Postgres refuses the function outright.
  SELECT i.id, w.id, w.slug, w.name, (w.status = 'active'), i.email, i.role,
         i.team_id, i.invited_by, i.expires_at, i.accepted_at, i.revoked_at
  FROM invitations i
  JOIN workspaces w ON w.id = i.workspace_id
  WHERE i.token_hash = p_token_hash
$$;

-- The workspace's LIFECYCLE is returned rather than filtered. A suspended desk
-- must produce "that workspace is not currently available" and not "this link is
-- not valid": one is a billing conversation with an administrator, the other
-- sends the invitee hunting for a typo in a perfectly good link. It also matters
-- mechanically — app_set_workspace RAISES on a non-active workspace, so the
-- caller has to know before it binds.
COMMENT ON FUNCTION app_resolve_invitation(text) IS
  'Bootstrap for the unauthenticated accept flow: one invitation and its workspace, '
  'looked up by token digest on a connection with no workspace bound.';

-- EXECUTE is granted to PUBLIC by default, and on a SECURITY DEFINER function
-- that is the whole vulnerability.
REVOKE ALL ON FUNCTION app_resolve_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_invitation(text) TO plumo_app;

-- ALTER DEFAULT PRIVILEGES in roles.sql already covers a new table, but the
-- failure mode otherwise is a 500 on the first invitation in production and
-- nowhere earlier, so say it explicitly.
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO plumo_app;


-- ============================================================================
-- 4. ASSERTIONS
--
-- Inside the migration's own transaction: anything that failed to take effect
-- rolls the whole file back rather than half-applying. Each one fails if its
-- step were skipped.
-- ============================================================================

DO $$
BEGIN
  -- (1) The policy exists. Without it this table is the one hole in tenant
  -- isolation, and nothing at runtime would report that.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'invitations' AND p.polname = 'workspace_isolation'
  ) THEN
    RAISE EXCEPTION 'invitations: workspace_isolation policy missing';
  END IF;

  -- (2) The resolver is SECURITY DEFINER and PUBLIC cannot call it. Either half
  -- failing is silent: without prosecdef every accept link reports "not valid",
  -- and with EXECUTE still on PUBLIC any role on the instance can trade a digest
  -- for a workspace name.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'app_resolve_invitation' AND prosecdef
  ) THEN
    RAISE EXCEPTION 'invitations: app_resolve_invitation is not SECURITY DEFINER';
  END IF;
  -- aclexplode, NOT has_function_privilege('public', ...). PUBLIC is a pseudo-
  -- role: it has no row in pg_authid, so has_function_privilege resolves the
  -- name through get_role_oid and raises `role "public" does not exist`, failing
  -- the migration on the assertion rather than on the thing it asserts. In an
  -- ACL, PUBLIC is grantee OID 0, and that is what has to be looked for.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.proname = 'app_resolve_invitation'
      AND a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'invitations: PUBLIC still holds EXECUTE on app_resolve_invitation';
  END IF;

  -- (3) The pending-uniqueness index. It is what makes "re-inviting replaces"
  -- structural; without it duplicates accumulate and a revoke leaves a live
  -- token behind.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'invitations_pending_email_key'
  ) THEN
    RAISE EXCEPTION 'invitations: pending-uniqueness index missing';
  END IF;

  RAISE NOTICE 'invitations: table, policy, resolver and indexes in place';
END $$;
