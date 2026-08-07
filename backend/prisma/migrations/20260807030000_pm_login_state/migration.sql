-- Allow a PM authorization that begins with nobody signed in.
--
-- pm_oauth_states.user_id was NOT NULL because the only flow was "link the
-- account I am already signed into". Signing in WITH Plumo starts from the
-- login screen, where there is no CS user yet — the whole point is to discover
-- which one this is.
--
-- Nullable rather than a second table: the two flows share the PKCE mechanics
-- exactly, and the null is meaningful rather than missing. It IS the
-- distinction:
--
--   user_id SET   -> a link. Apply the PM identity to THAT user, and to no
--                    other. A stolen callback cannot attach an identity to an
--                    account the caller does not control.
--   user_id NULL  -> a sign-in. Resolve the CS user from the PM subject, and
--                    refuse if no account is linked. Never create one: a PM
--                    workspace can contain read-only members who have no
--                    business in a support desk.
ALTER TABLE pm_oauth_states ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN pm_oauth_states.user_id IS
  'Set for a link (apply to this user); NULL for a sign-in (resolve the user from the PM subject).';
