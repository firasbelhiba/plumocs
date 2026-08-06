#!/usr/bin/env bash
#
# Scheduled logical backup of the Plumo CS database.
#
# Runs as `ubuntu` from cron. pg_dump runs as the `postgres` superuser (so it
# can read every table regardless of the plumo_app/plumo_migrator split), but
# writes to STDOUT, which this script redirects into a file it owns. That
# ordering matters: having pg_dump write the file directly would leave it owned
# by postgres, and a dump nobody else can read is a dump that fails to restore
# at the worst possible moment.
#
# Retention: daily dumps for 14 days, Sunday dumps for 8 weeks. At ~150 KB a
# dump this is nothing; the limit exists so the directory stays legible, not to
# save space.
set -euo pipefail

DB=plumo_cs
DIR=/opt/plumo-cs/backups
LOG=/opt/plumo-cs/backups/backup.log

ts=$(date -u +%Y%m%dT%H%M%SZ)
# An explicit kind (e.g. "predeploy-9f3a1c2") opts out of retention entirely:
# only daily-*/weekly-* are swept, so a dump taken deliberately before a risky
# change is never deleted by the routine sweep. Without this, deploy.sh's
# pre-deploy dump filed as a daily and could be reaped 14 days later — while
# still being the only thing that could undo that deploy.
if [ -n "${1:-}" ]; then
  kind=$1
# %u gives 1..7 with 7 = Sunday.
elif [ "$(date -u +%u)" = "7" ]; then kind=weekly; else kind=daily; fi
out="$DIR/${kind}-${DB}-${ts}.dump"
tmp=$(mktemp /tmp/plumo-pgdump.XXXXXX)
trap 'rm -f "$tmp"' EXIT

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >>"$LOG"; }

# --- dump ------------------------------------------------------------------
if ! sudo -u postgres pg_dump -Fc -d "$DB" >"$tmp" 2>>"$LOG"; then
  log "FAIL pg_dump exited non-zero; no backup written"
  exit 1
fi

# --- structural check ------------------------------------------------------
# Reading the archive's table of contents proves the file is a complete,
# parseable custom-format dump rather than a truncated one — which is the
# realistic failure (disk full, killed mid-write), and is otherwise invisible
# until a restore is attempted under pressure.
#
# This is NOT a restore. A real restore-into-scratch check is heavier and
# belongs on a slower schedule; see ops/README or docs/dockerise-production.md.
if ! pg_restore -l "$tmp" >/dev/null 2>>"$LOG"; then
  log "FAIL dump is not a readable archive; discarding $tmp"
  exit 1
fi

size=$(stat -c%s "$tmp")
if [ "$size" -lt 10000 ]; then
  log "FAIL dump implausibly small (${size} bytes); discarding"
  exit 1
fi

install -m 600 "$tmp" "$out"

# --- retention -------------------------------------------------------------
# Deletes only files this script created; the hand-taken pre-*/plumo_cs-* dumps
# are left alone on purpose — they mark specific moments someone cared about.
find "$DIR" -maxdepth 1 -name "daily-${DB}-*.dump" -mtime +14 -delete
find "$DIR" -maxdepth 1 -name "weekly-${DB}-*.dump" -mtime +56 -delete

log "ok $out ${size} bytes"
