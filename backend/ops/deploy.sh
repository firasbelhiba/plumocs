#!/usr/bin/env bash
#
# Deploy (or roll back to) a tagged Plumo CS build.
#
#   ./deploy.sh 9f3a1c2                deploy that tag
#   ./deploy.sh 9f3a1c2 --no-migrate   skip migrations (schema-compatible rollback)
#
# Rolling back is the same command with an earlier tag: the procedure you run
# under pressure should be one you have already run.
#
# ROLLING BACK ACROSS A MIGRATION DOES NOT WORK. `prisma migrate deploy` only
# rolls forward. If a deploy applied a destructive migration — Phase 2b drops
# users.role and users.team_id — redeploying the old image is NOT recovery: the
# old code cannot read the new schema, and it will fail in ways that look like
# something else. That case needs a restore (ops/restore.sh) from the dump taken
# below. Containers make code instant to revert and do nothing for schema.
set -euo pipefail

TAG=${1:?usage: deploy.sh <tag> [--no-migrate]}
MIGRATE=yes
[ "${2:-}" = "--no-migrate" ] && MIGRATE=no

APP=/opt/plumo-cs/app
COMPOSE="docker compose -f $APP/docker-compose.prod.yml"
export PLUMO_TAG="$TAG"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m!!  %s\033[0m\n' "$*" >&2; exit 1; }

# --- preflight: the host units must be gone ---------------------------------
# Under network_mode: host the container and plumo-api.service compete for port
# 3002. The container loses (EADDRINUSE), crash-loops under restart:
# unless-stopped — and every health probe against 127.0.0.1:3002 is answered by
# the surviving systemd process. Without this check the script cheerfully
# reports a successful cutover in which nothing was containerised at all.
for unit in plumo-api plumo-worker; do
  if systemctl is-active --quiet "$unit" 2>/dev/null; then
    die "$unit.service is still running.
    It owns port 3002 and would make every health check below meaningless.
    Run once, deliberately:  sudo systemctl disable --now plumo-api plumo-worker"
  fi
done

# --- preflight: both images must exist --------------------------------------
# Checking only the runtime image meant a missing migrate image surfaced as a
# compose registry pull attempt, mid-deploy, after the backup.
NEEDED=("plumo-cs:$TAG")
[ "$MIGRATE" = yes ] && NEEDED+=("plumo-cs-migrate:$TAG")
for img in "${NEEDED[@]}"; do
  docker image inspect "$img" >/dev/null 2>&1 || {
    echo "No image $img. Build it first (./ops/build.sh), or pick from:" >&2
    docker images plumo-cs --format '  {{.Tag}}  ({{.CreatedSince}})' >&2
    exit 1
  }
done

# What we are coming FROM, captured before the swap destroys the evidence.
PREV=$(docker inspect -f '{{.Config.Image}}' plumo-api 2>/dev/null || echo "")
PREV_TAG=${PREV#plumo-cs:}
[ -n "$PREV_TAG" ] || PREV_TAG="(none — first cutover; host units are the fallback)"

# --- always back up first ---------------------------------------------------
# Tagged with the deploy, not filed as a routine daily: retention deletes
# daily-* after 14 days, and the dump you want at 2am is the one taken right
# before the deploy that broke things.
say "Backing up before touching anything"
/opt/plumo-cs/ops/pg-backup.sh "predeploy-$TAG"
DUMP=$(tail -1 /opt/plumo-cs/backups/backup.log | awk '{print $3}')
echo "  $DUMP"

# --- refuse the one migration that cannot be undone -------------------------
#
# 20260802000000_workspace_tenancy DROPS users.role and users.team_id. Applying
# it to production while the app still reads those columns takes the desk down,
# and `prisma migrate deploy` has no reverse — recovery is a restore, losing
# every write since the dump.
#
# Production is currently pre-tenancy (both columns present, the migration not
# in _prisma_migrations) while the repo's schema.prisma is the tenancy version.
# That mismatch is Phase 2b, in progress. Until it lands and its isolation
# proofs pass, no ordinary deploy may apply this.
#
# REMOVING THIS GUARD IS A DELIBERATE ACT. When Phase 2b is genuinely ready,
# delete this block in the same commit that makes the app run on the tenancy
# schema — so the guard and the reason it existed disappear together.
TENANCY_MIGRATION=20260802000000_workspace_tenancy
if [ "$MIGRATE" = yes ] && [ "${ALLOW_TENANCY_MIGRATION:-no}" != yes ]; then
  applied=$(sudo -u postgres psql -d plumo_cs -tAc \
    "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$TENANCY_MIGRATION' AND finished_at IS NOT NULL;" 2>/dev/null || echo 0)
  if [ "$applied" = "0" ] && [ -d "$APP/prisma/migrations/$TENANCY_MIGRATION" ]; then
    die "$TENANCY_MIGRATION is pending and would be applied by this deploy.
    It drops users.role and users.team_id. There is no rollback — only a restore.
    Phase 2b (making the app run on the tenancy schema) must land first.

    To deploy without it:            ./deploy.sh $TAG --no-migrate
    To apply it on purpose, later:   ALLOW_TENANCY_MIGRATION=yes ./deploy.sh $TAG"
  fi
fi

# --- migrations, as a decision with an exit code ----------------------------
if [ "$MIGRATE" = yes ]; then
  say "Applying migrations (as plumo_migrator)"
  # set -e aborts here on failure. A half-migrated database that then starts
  # serving traffic is worse than a deploy that stops.
  $COMPOSE --profile tools run --rm migrate
  MIGRATED=yes
else
  say "Skipping migrations (--no-migrate)"
  MIGRATED=no
fi

# --- swap -------------------------------------------------------------------
say "Starting $TAG  (from: $PREV_TAG)"
# --wait blocks on the container HEALTHCHECK rather than returning the instant
# the container is created. It can still be satisfied by the wrong thing, which
# is why the identity assertions below exist as well.
$COMPOSE up -d --remove-orphans --wait || true

# --- verify the CONTAINER is serving, not merely that the port answers -------
say "Verifying"
ok=no
for i in $(seq 1 30); do
  running=$(docker inspect -f '{{.State.Running}}'      plumo-api 2>/dev/null || echo false)
  image=$(  docker inspect -f '{{.Config.Image}}'       plumo-api 2>/dev/null || echo none)
  health=$( docker inspect -f '{{.State.Health.Status}}' plumo-api 2>/dev/null || echo none)
  if [ "$running" = true ] && [ "$image" = "plumo-cs:$TAG" ] && [ "$health" = healthy ]; then
    ok=yes; break
  fi
  sleep 1
done

if [ "$ok" = yes ]; then
  # Only now is a port probe meaningful — we know the container is the healthy
  # thing behind it.
  curl -sf -o /dev/null http://127.0.0.1:3002/health || die "container healthy but nginx path failing"
  say "Deployed $TAG"
  $COMPOSE ps
  echo
  echo "Rollback:  ./deploy.sh $PREV_TAG --no-migrate"
  exit 0
fi

# --- failure ----------------------------------------------------------------
say "FAILED — api container did not come up healthy as plumo-cs:$TAG"
echo "  running=$running image=$image health=$health" >&2
echo >&2
$COMPOSE logs --tail=40 api >&2 || true
echo >&2
# Stop the crash-loop so it is not fighting for the port while you work.
$COMPOSE down >&2 2>&1 || true
echo "Containers stopped." >&2
echo >&2
if [ "$MIGRATED" = yes ]; then
  cat >&2 <<EOF
MIGRATIONS WERE APPLIED. Redeploying the previous tag may APPEAR to work and
will not: the old code does not know this schema.

  Restore:   sudo /opt/plumo-cs/ops/restore.sh $DUMP
             (loses every write since that dump was taken)
  Then:      ./deploy.sh $PREV_TAG --no-migrate
EOF
else
  cat >&2 <<EOF
No migrations ran, so the schema is untouched and the code can simply go back.

  ./deploy.sh $PREV_TAG --no-migrate
  or, to return to the host units:  sudo systemctl enable --now plumo-api plumo-worker
EOF
fi
exit 1
