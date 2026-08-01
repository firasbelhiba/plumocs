-- Full-text search column + trigger — SUPERSEDED, kept only as a pointer.
--
-- An earlier version of this header claimed these objects were already part of
-- migration history. They were not: they had been applied out of band by an
-- `npm run db:extras` script, so any database built from migrations alone had no
-- search column, and both consuming code paths swallow that failure silently.
--
-- The real, idempotent definitions now live in
--   prisma/migrations/20260801170000_search_tsv_and_btree_gin/migration.sql
-- and are applied by `prisma migrate deploy` as plumo_migrator. Change them
-- there. This file is retained so anything still referencing it leads to that
-- migration rather than to a dead path.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS search_tsv tsvector;

CREATE OR REPLACE FUNCTION tickets_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english', coalesce(NEW.subject, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_tsv_trigger ON tickets;
CREATE TRIGGER tickets_tsv_trigger
  BEFORE INSERT OR UPDATE OF subject ON tickets
  FOR EACH ROW EXECUTE FUNCTION tickets_tsv_update();

-- Fold the latest message body into a ticket's tsv (called by the worker).
CREATE OR REPLACE FUNCTION refresh_ticket_tsv(p_ticket_id uuid) RETURNS void AS $$
  UPDATE tickets t
  SET search_tsv =
    to_tsvector('english', coalesce(t.subject, '')) ||
    to_tsvector('english', coalesce((
      SELECT string_agg(left(m.body, 2000), ' ')
      FROM (
        SELECT body FROM ticket_messages
        WHERE ticket_id = p_ticket_id AND is_internal_note = false
        ORDER BY created_at DESC LIMIT 3
      ) m
    ), ''))
  WHERE t.id = p_ticket_id;
$$ LANGUAGE sql;

CREATE INDEX IF NOT EXISTS tickets_search_tsv_idx ON tickets USING GIN (search_tsv);

-- Backfill
UPDATE tickets SET search_tsv = to_tsvector('english', coalesce(subject, ''))
WHERE search_tsv IS NULL;
