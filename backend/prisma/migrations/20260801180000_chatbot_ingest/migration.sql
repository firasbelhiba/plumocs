-- Chatbot ingest: the schema the 4hacks integration needs.
--
-- Hand-written, like every migration here. `prisma migrate diff` cannot be used:
-- it is blind to tickets.search_tsv, its trigger and GIN index, ticket_number_seq
-- and — after this file — the two partial unique indexes below, and it proposes
-- DROPping everything it cannot see.
--
-- WHAT THIS ENABLES
--   * A chatbot is an API key. Tickets and messages record which one produced
--     them, which today is recorded nowhere except the audit log.
--   * An anonymous chat visitor can exist. Until now Customer.email was NOT NULL
--     and globally unique, so a visitor who never gives an email could not be
--     represented at all.
--   * A multi-turn conversation maps to one ticket, idempotently, so a retry
--     from the partner does not mint a duplicate.
--   * A bot reply is distinguishable from an agent, a customer and a system
--     note, and has its own SLA semantics.
--
-- Deliberately NOT here: workspace_id. It is tempting to add a nullable one now
-- as insurance, but ADD COLUMN of a nullable column is metadata-only in
-- PostgreSQL 11+, so pre-adding buys nothing and leaves a column that means
-- nothing until the tenancy migration fills it.

-- ---------------------------------------------------------------- enums
-- Safe inside the migration transaction on PostgreSQL 12+ *because nothing here
-- uses the new values*. Using a value added in the same transaction that added
-- it raises "unsafe use of new value of enum type"; the first rows carrying
-- 'bot' or 'chatbot' arrive later, from the application.

ALTER TYPE author_type ADD VALUE IF NOT EXISTS 'bot';

-- One generic value, never a partner-specific one. 'chatbot' makes the existing
-- by-channel report, the inbox channel facet and the console filter rail work
-- for bot traffic with no new code; a '4hacks' value would need a new enum
-- member per customer forever.
ALTER TYPE channel ADD VALUE IF NOT EXISTS 'chatbot';

-- ---------------------------------------------------------------- api keys

-- A third party holding a credential that never expires is very hard to revisit
-- once they depend on it. Nullable so existing internal keys are unaffected.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- ---------------------------------------------------------------- customers

-- An anonymous visitor has no email. Dropping NOT NULL is what makes them
-- representable; the alternative — minting a synthetic address — was rejected
-- because findOrCreateByEmail infers organisation membership from the email
-- domain, so every synthetic visitor would be filed under a fake company.
ALTER TABLE customers ALTER COLUMN email DROP NOT NULL;

-- Email stays unique, but only among rows that have one. A plain unique index
-- treats NULLs as distinct so it would technically work, but the partial index
-- states the intent and stays correct if the column is ever backfilled.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_email_key;
DROP INDEX IF EXISTS customers_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_idx
  ON customers (email) WHERE email IS NOT NULL;

-- Identity for a visitor who has no email: whichever chatbot saw them, plus that
-- chatbot's own opaque reference for the person. Scoped to the key rather than
-- global because two chatbots' visitor ids have nothing to do with each other.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS visitor_api_key_id uuid;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS visitor_ref text;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_visitor_api_key_id_fkey;
ALTER TABLE customers ADD CONSTRAINT customers_visitor_api_key_id_fkey
  FOREIGN KEY (visitor_api_key_id) REFERENCES api_keys (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_visitor_unique_idx
  ON customers (visitor_api_key_id, visitor_ref)
  WHERE visitor_ref IS NOT NULL;

-- A row must be reachable: it needs an email, or a visitor identity, or both.
-- Without this a customer with neither is unfindable and silently orphaned.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_identity_check;
ALTER TABLE customers ADD CONSTRAINT customers_identity_check
  CHECK (email IS NOT NULL OR (visitor_api_key_id IS NOT NULL AND visitor_ref IS NOT NULL));

-- ---------------------------------------------------------------- tickets

-- Which chatbot filed this. ON DELETE SET NULL rather than CASCADE: revoking a
-- chatbot must never delete the conversations it handled.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS created_by_api_key_id uuid;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_created_by_api_key_id_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_created_by_api_key_id_fkey
  FOREIGN KEY (created_by_api_key_id) REFERENCES api_keys (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tickets_created_by_api_key_id_idx
  ON tickets (created_by_api_key_id) WHERE created_by_api_key_id IS NOT NULL;

-- SLA for bot-first traffic, per the decided semantics: a bot reply does NOT
-- satisfy first response. It stamps its own column, and the human clock starts
-- at handoff.
--
-- The bug this avoids is live today and is the opposite of the obvious one:
-- first_responded_at is stamped only when the actor is a human user, so a bot
-- can never set it, the new->open auto-transition is skipped too, and the ticket
-- sits in 'new' with a null first_responded_at — which is exactly the SLA
-- sweep's candidate set. Every bot conversation would falsely breach and page a
-- human who was auto-assigned by round-robin at creation.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS bot_replied_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS handed_off_at timestamptz;

-- The sweep and the inbox both need "is a human accountable for this yet?" to be
-- cheap. Partial, because only bot-handled tickets are ever asked.
CREATE INDEX IF NOT EXISTS tickets_awaiting_handoff_idx
  ON tickets (handed_off_at) WHERE created_by_api_key_id IS NOT NULL;

-- ---------------------------------------------------------------- messages

-- Which chatbot wrote a message, for author_type = 'bot'. Distinct from
-- created_by_api_key_id on the ticket: a conversation opened by one chatbot
-- could in principle be continued by another.
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS author_api_key_id uuid;
ALTER TABLE ticket_messages DROP CONSTRAINT IF EXISTS ticket_messages_author_api_key_id_fkey;
ALTER TABLE ticket_messages ADD CONSTRAINT ticket_messages_author_api_key_id_fkey
  FOREIGN KEY (author_api_key_id) REFERENCES api_keys (id) ON DELETE SET NULL;

-- The partner's own id for a turn. Makes appending a message idempotent: a
-- retried request collides here instead of duplicating the turn.
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS external_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS ticket_messages_external_ref_unique_idx
  ON ticket_messages (ticket_id, external_ref) WHERE external_ref IS NOT NULL;

-- ---------------------------------------------------------------- sessions

-- One chat conversation. The partner sends its own session reference; we map it
-- to exactly one ticket, and the unique constraint below is what makes opening a
-- conversation idempotent without a separate idempotency-key ledger.
--
-- Uniqueness is (api_key_id, session_ref) rather than (workspace_id, session_ref)
-- because a key belongs to exactly one workspace: the per-key constraint is
-- strictly narrower, so it stays correct after tenancy lands and never needs
-- widening or a data migration.
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id  uuid NOT NULL REFERENCES api_keys (id) ON DELETE CASCADE,
  session_ref text NOT NULL,
  ticket_id   uuid NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  visitor_ref text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_sessions_key_ref_unique_idx
  ON chat_sessions (api_key_id, session_ref);
CREATE INDEX IF NOT EXISTS chat_sessions_ticket_id_idx ON chat_sessions (ticket_id);
