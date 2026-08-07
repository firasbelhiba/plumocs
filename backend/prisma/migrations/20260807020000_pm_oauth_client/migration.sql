-- Storage for Plumo CS acting as an OAuth client of Plumo PM.
--
-- Two things need to outlive a request, and they have opposite lifetimes.

-- 1. THE REGISTRATION. PM supports dynamic client registration, so CS registers
-- itself once and keeps the client_id forever. Re-registering on every boot
-- would work — PM issues public clients with no secret — but it would litter
-- PM with a new client per restart, and each one appears in a user's list of
-- authorised applications. One row, reused.
--
-- Keyed on (issuer, redirect_uri): a staging CS and a production CS pointing at
-- the same PM are different clients and must not share a registration, and
-- changing the redirect URI requires a new registration anyway because PM pins
-- it at registration time.
--
-- GLOBAL, not per-workspace. The registration identifies this *deployment* of
-- Plumo CS to PM, not any one desk. It deliberately has no workspace_id and no
-- RLS policy, for the same reason `users` does not: it is consulted before any
-- workspace is known.
CREATE TABLE IF NOT EXISTS pm_oauth_clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer       text        NOT NULL,
  redirect_uri text        NOT NULL,
  client_id    text        NOT NULL,
  scopes       text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, redirect_uri)
);

COMMENT ON TABLE pm_oauth_clients IS
  'This CS deployment''s OAuth client registration with a Plumo PM issuer. One row per (issuer, redirect_uri).';

-- 2. THE IN-FLIGHT AUTHORIZATION. A PKCE flow has to remember, between the
-- redirect out and the callback back, three things it must not send through the
-- browser: the code_verifier, which user started the flow, and the state it
-- issued.
--
-- WHY A TABLE AND NOT A COOKIE OR REDIS. A cookie would put the verifier in the
-- browser, which is exactly what PKCE exists to avoid. Redis is available but
-- would make login fail whenever the queue broker is down — a dependency auth
-- does not otherwise have.
--
-- `state` is UNIQUE and consumed on use (see consumed_at): a callback may be
-- replayed, and a code that has already been exchanged must not be exchangeable
-- twice. Rows are deleted after expiry rather than kept; there is nothing here
-- worth auditing and the verifier is a secret with no reason to persist.
CREATE TABLE IF NOT EXISTS pm_oauth_states (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state         text        NOT NULL UNIQUE,
  code_verifier text        NOT NULL,
  -- Who began the flow. The link is applied to THIS user on callback, so a
  -- stolen callback URL cannot attach someone else's PM identity to an account
  -- they do not control.
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The desk the link is being made for. Nullable because the flow can be
  -- started before a workspace is chosen, but set for the workspace mapping.
  workspace_id  uuid        REFERENCES workspaces(id) ON DELETE CASCADE,
  return_to     text,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_oauth_states_expires_at_idx ON pm_oauth_states (expires_at);

COMMENT ON TABLE pm_oauth_states IS
  'In-flight PKCE authorizations. Short-lived; the code_verifier never leaves the server.';

-- The runtime role needs to read and write both. They carry no workspace_id, so
-- the RLS policy loop in the tenancy migration never covered them — these
-- grants are what the earlier migration''s GRANT ON ALL TABLES did for tables
-- that existed at the time.
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_oauth_clients TO plumo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_oauth_states  TO plumo_app;
