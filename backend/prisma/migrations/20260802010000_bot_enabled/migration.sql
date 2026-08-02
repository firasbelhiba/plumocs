-- An explicit "may the bot speak?" switch on a conversation.
--
-- Hand-written, like every migration here. `prisma migrate diff` is blind to
-- tickets.search_tsv, its trigger and GIN index, ticket_number_seq and the
-- partial unique indexes on customers and ticket_messages, and proposes
-- DROPping all of them. Never apply a generated diff.
--
-- WHY THIS IS A COLUMN AND NOT DERIVED
--
-- `handling` already reports who owns a conversation, derived from
-- handed_off_at + assignee_id, and a partner could infer "stay quiet" from it.
-- That is not enough, for two reasons.
--
-- First, an agent can reply to a bot conversation WITHOUT any handoff — which is
-- exactly what happens when someone reads the inbox and just answers. Before
-- this column, handed_off_at stayed null, `handling` stayed 'ai', and the bot
-- carried on answering over the top of a human. The screenshot that prompted
-- this had an admin and a chatbot replying to the same customer.
--
-- Second, the operator needs to be able to say "stop" and later "carry on"
-- independently of ticket state. That is a control, not a consequence, and a
-- derived value cannot be set.
--
-- Default TRUE: a brand new conversation belongs to the bot. It flips to false
-- the moment a human speaks or the bot hands off, and only an explicit action
-- turns it back on.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS bot_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN tickets.bot_enabled IS
  'May the chatbot post to this conversation? Set false when a human takes over — '
  'by handing off or simply by replying. The ingest API rejects bot messages while '
  'this is false, so a partner that ignores the flag still cannot talk over an agent.';

-- Backfill the conversations a human has already touched, so the switch is
-- correct for existing rows rather than only for new ones. Two cases:
--   * handed off — the bot gave it up itself
--   * an agent has posted a non-internal message — a human is in the thread
UPDATE tickets t
SET bot_enabled = false
WHERE t.created_by_api_key_id IS NOT NULL
  AND (
    t.handed_off_at IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM ticket_messages m
      WHERE m.ticket_id = t.id AND m.author_type = 'agent' AND m.is_internal_note = false
    )
  );

-- Partial: the only question ever asked is "which bot conversations are still
-- the bot's", and that is a small slice of a table that will be mostly closed
-- human tickets.
CREATE INDEX IF NOT EXISTS tickets_bot_enabled_idx
  ON tickets (bot_enabled)
  WHERE created_by_api_key_id IS NOT NULL AND bot_enabled;
