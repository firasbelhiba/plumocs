-- Hand-written on purpose.
--
-- `prisma migrate diff` wants to DROP tickets.search_tsv, its GIN index and the
-- ticket_number_seq sequence, because those are created by raw SQL
-- (prisma/sql/search_tsv.sql and the 00000000000000_setup migration) and so are
-- invisible to the Prisma schema. Applying the generated diff would silently
-- destroy full-text search and human-readable ticket numbering. Only the
-- intended changes are below.

-- 1. Confine a machine principal to a single team (nullable = instance-wide).
ALTER TABLE "api_keys" ADD COLUMN "team_id" UUID;

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "api_keys_team_id_idx" ON "api_keys"("team_id");

-- 2. Index the default inbox ordering, including the cursor tiebreaker.
CREATE INDEX "tickets_updated_at_id_idx" ON "tickets"("updated_at" DESC, "id" DESC);

-- 3. Give the nightly export its own cursor instead of a synthetic audit_log row.
CREATE TABLE "export_state" (
    "id"          TEXT        NOT NULL DEFAULT 'daily',
    "watermark"   TIMESTAMPTZ NOT NULL,
    "last_count"  INTEGER     NOT NULL DEFAULT 0,
    "last_run_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_state_pkey" PRIMARY KEY ("id")
);

-- Carry over the existing watermark, if the old audit_log-based export ever ran,
-- so the first run after this migration doesn't re-export the whole history.
INSERT INTO "export_state" ("id", "watermark", "last_count", "last_run_at")
SELECT 'daily',
       COALESCE((diff_json->>'watermark')::timestamptz, to_timestamp(0)),
       COALESCE((diff_json->>'count')::int, 0),
       created_at
FROM "audit_log"
WHERE entity_type = 'export' AND action = 'export.daily'
ORDER BY created_at DESC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;
