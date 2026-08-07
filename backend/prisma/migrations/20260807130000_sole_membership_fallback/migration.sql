-- Let an unnamed request resolve to the caller's own desk.
--
-- THIS IS THE BLOCKER ON EVER CREATING A SECOND WORKSPACE. /auth/login and
-- /auth/refresh are sent with `auth: false` by the console (frontend
-- lib/api/endpoints.js), and the X-Workspace-Slug header is attached only when
-- `auth` is truthy (lib/api/client.js) — so the two endpoints that most need to
-- name a workspace are exactly the two that never do.
--
-- Today that is survivable because app_active_workspaces() returns exactly one
-- row and the server infers it. The moment a second workspace exists, the
-- inference disables itself and every login and every token refresh on the
-- instance answers 403. Worse, the service memoises a successful probe for the
-- life of the process, so nothing breaks when the workspace is created — it
-- breaks at the next restart or deploy, hours later, with no visible connection
-- to the cause.
--
-- The fix is that a login already knows WHO is asking, even though it does not
-- know WHICH desk. If that human belongs to exactly one active desk, there is
-- nothing to disambiguate and no header was ever needed.
--
-- SECURITY DEFINER for the same reason app_resolve_membership is: the login
-- path runs on an unbound connection, and workspace_memberships is under the
-- workspace_isolation policy, so plumo_app reading it directly matches zero
-- rows and every login would fail closed.
CREATE FUNCTION app_resolve_sole_membership(p_user_id uuid)
  RETURNS TABLE (workspace_id uuid, membership_id uuid, role user_role,
                 team_id uuid, membership_active boolean, workspace_slug citext)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT w.id, m.id, m.role, m.team_id, m.is_active, w.slug
  FROM workspaces w
  JOIN workspace_memberships m ON m.workspace_id = w.id AND m.user_id = p_user_id
  WHERE w.status = 'active'
    AND m.is_active
  -- LIMIT 2, not 1. The caller must be able to tell "exactly one" from "several"
  -- and only fall back when it is genuinely one: picking a row out of several
  -- would silently drop somebody into whichever desk the planner happened to
  -- return first, and that is a cross-tenant answer arrived at by coin flip.
  LIMIT 2
$$;

-- EXECUTE is granted to PUBLIC by default, and on a SECURITY DEFINER function
-- that is the whole vulnerability.
REVOKE ALL ON FUNCTION app_resolve_sole_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_sole_membership(uuid) TO plumo_app;

COMMENT ON FUNCTION app_resolve_sole_membership(uuid) IS
  'Bootstrap for unnamed requests: the caller''s single active membership, or nothing when they have none or several.';
