-- Index the /chat/updates feed.
--
-- The partner poller runs this every 5 seconds per chatbot:
--
--   WHERE created_at > $1 AND author_type = 'agent' AND is_internal_note = false
--   ORDER BY created_at, id
--
-- The only indexes on ticket_messages are (ticket_id, created_at) and
-- (email_message_id); neither leads with created_at, so nothing supports this
-- predicate and every poll scans the whole table. That is invisible today at a
-- few hundred rows and becomes a permanent, self-inflicted load once the table
-- is large — a sequential scan on every message ever sent, twelve times a
-- minute, forever, to return the handful of rows written since the last tick.
--
-- Partial on (author_type, is_internal_note) because agent replies are a small
-- fraction of all messages: the index stays tiny and holds only rows this query
-- can actually return. Sorted on (created_at, id) to match the ORDER BY exactly,
-- so the LIMIT is satisfied by an index scan with no sort step.
--
-- NOTE FOR `prisma migrate diff`: Prisma cannot express a partial index, so it
-- does not know this exists and will propose DROPping it on the next schema
-- diff. Keep it.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: Prisma wraps each migration in a
-- transaction, and CONCURRENTLY cannot run inside one. The table is small, so
-- the brief write lock is not worth working around. If this ever needs to be
-- rebuilt on a large table, run it CONCURRENTLY by hand, outside Migrate.
CREATE INDEX IF NOT EXISTS ticket_messages_agent_feed_idx
  ON ticket_messages (created_at, id)
  WHERE author_type = 'agent' AND is_internal_note = false;
