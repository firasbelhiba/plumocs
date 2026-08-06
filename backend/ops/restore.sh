#!/usr/bin/env bash
#
# Restore the Plumo CS database from a dump.
#
#   sudo ./restore.sh /opt/plumo-cs/backups/predeploy-plumo_cs-2026....dump
#
# This existed only as the phrase "restore from the dump" in a failure message,
# which is not a recovery plan. The moment you need this you are already having
# a bad day, so it refuses to guess at anything and tells you exactly what it
# is about to destroy before it does it.
#
# THIS IS DESTRUCTIVE. It replaces the contents of the live database. Every
# write since the dump was taken is lost — tickets, messages, everything.
set -euo pipefail

DUMP=${1:?usage: restore.sh <dump-file> [--yes]}
ASSUME_YES=no
[ "${2:-}" = "--yes" ] && ASSUME_YES=yes

DB=plumo_cs
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!!  %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$DUMP" ] || die "No such dump: $DUMP"

# Readable by postgres? The dumps are 600 and owned by ubuntu, while pg_restore
# runs as postgres — this is a real failure that has already bitten once.
TMP=/tmp/plumo-restore-$$.dump
install -m 600 -o postgres -g postgres "$DUMP" "$TMP"
trap 'rm -f "$TMP"' EXIT

# Prove the archive is intact BEFORE destroying anything.
say "Checking the dump is readable"
sudo -u postgres pg_restore -l "$TMP" >/dev/null || die "Dump is not a readable archive. Do not proceed."

say "About to REPLACE the contents of '$DB'"
echo "  from: $DUMP"
echo "  dated: $(date -u -r "$DUMP" +%FT%TZ)"
echo
echo "  Current live data that will be DESTROYED:"
sudo -u postgres psql -d "$DB" -tAF' | ' -c \
  "SELECT 'tickets',count(*) FROM tickets UNION ALL \
   SELECT 'ticket_messages',count(*) FROM ticket_messages UNION ALL \
   SELECT 'customers',count(*) FROM customers;" | sed 's/^/    /'

if [ "$ASSUME_YES" != yes ]; then
  echo
  read -r -p "  Type the database name to confirm: " reply
  [ "$reply" = "$DB" ] || die "Not confirmed; nothing changed."
fi

# Take a dump of what we are about to overwrite. Restoring the wrong file is a
# real mistake, and without this it is unrecoverable.
say "Snapshotting current state first"
/opt/plumo-cs/ops/pg-backup.sh "pre-restore"
tail -1 /opt/plumo-cs/backups/backup.log

say "Stopping the app so nothing writes mid-restore"
docker compose -f /opt/plumo-cs/app/docker-compose.prod.yml down 2>/dev/null || true
systemctl stop plumo-api plumo-worker 2>/dev/null || true

say "Restoring"
# --clean --if-exists drops the existing objects inside the same run, so the
# database is never left half-empty if the restore aborts partway.
sudo -u postgres pg_restore --clean --if-exists --no-owner --no-acl -d "$DB" "$TMP"

say "Restored — row counts now"
sudo -u postgres psql -d "$DB" -tAF' | ' -c \
  "SELECT 'tickets',count(*) FROM tickets UNION ALL \
   SELECT 'ticket_messages',count(*) FROM ticket_messages UNION ALL \
   SELECT 'customers',count(*) FROM customers;" | sed 's/^/    /'

cat <<EOF

The app is still STOPPED, deliberately — check the data above before serving it.

  containers:  cd /opt/plumo-cs/app && ./ops/deploy.sh <tag> --no-migrate
  host units:  sudo systemctl start plumo-api plumo-worker
EOF
