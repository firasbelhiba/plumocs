-- Full-text search, finally put into migration history — plus btree_gin.
--
-- WHY THIS EXISTS
-- tickets.search_tsv, the tickets_tsv_trigger, tickets_tsv_update(),
-- refresh_ticket_tsv() and tickets_search_tsv_idx have been live in the dev
-- database for a long time, but they were never in a migration. They were
-- applied out of band by an `npm run db:extras` script which has since been
-- removed, and prisma/sql/search_tsv.sql claimed — incorrectly — that they were
-- already part of migration history. Reading every migration.sql end to end
-- confirms otherwise: 00000000000000_setup creates only citext, pgcrypto and
-- ticket_number_seq.
--
-- The consequence was invisible in dev and total in a fresh environment: any
-- database built from migrations alone had no search_tsv column at all, and both
-- consuming paths swallow the failure silently, so search simply returned
-- nothing with no error anywhere.
--
-- Every statement is idempotent, so this applies as a no-op to the existing
-- database (where the objects already exist) and creates them properly on a
-- fresh one. The definitions below were read back out of the live database with
-- pg_get_functiondef / pg_get_triggerdef and match it exactly.
--
-- NOTE FOR FUTURE SCHEMA CHANGES: like the search column before it, none of
-- this is visible to the Prisma schema, so `prisma migrate diff` will propose
-- DROPping all of it. Generated diffs must never be applied — see the header of
-- 20260801141609_api_key_team_scope_export_state.

-- btree_gin lets a GIN index combine a scalar column with a GIN-indexable one.
-- Not needed by anything today; it is required by the workspace migration, which
-- rebuilds the tags and search_tsv indexes to lead with workspace_id so a tenant
-- scan cannot touch another tenant's index entries. Installed here because it is
-- an extension and belongs with the others, not buried in a data migration.
CREATE EXTENSION IF NOT EXISTS btree_gin;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- Subject only. Message bodies are folded in asynchronously by the search.index
-- worker job calling refresh_ticket_tsv() below, because a trigger cannot see
-- messages that have not been written yet.
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

-- Folds the three most recent public messages into the ticket's vector.
-- Internal notes are excluded on purpose: an agent's private note must not make
-- a ticket findable by a search term the customer never used.
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

-- Backfill rows that predate the column. No-op where the trigger already ran.
UPDATE tickets SET search_tsv = to_tsvector('english', coalesce(subject, ''))
WHERE search_tsv IS NULL;
