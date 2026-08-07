#!/usr/bin/env bash
#
# Deploy the API and worker as containers, on the host, from a git ref.
#
# The container counterpart to deploy-native.sh, which stays in the repo as the
# rollback path: until the compose stack has run for a while, "put it back the
# way it was" must remain one command.
#
# Called by .github/workflows/deploy.yml over SSH, and safe to run by hand:
#   bash /opt/plumo-cs/source/backend/ops/deploy-container.sh <ref>
#
# Everything is tagged with the commit SHA. `latest` moving under a running
# container is how you end up unable to say what is deployed, and the previous
# tag is what makes rollback a retag rather than a rebuild.

set -Eeuo pipefail

REPO_URL="https://github.com/firasbelhiba/plumocs.git"
SOURCE_DIR="/opt/plumo-cs/source"
APP_DIR="/opt/plumo-cs/app"
COMPOSE="$SOURCE_DIR/backend/docker-compose.prod.yml"
HEALTH_URL="http://127.0.0.1:3002/health"
REF="${1:-origin/main}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn] %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m[FAIL] %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight --
[[ $EUID -ne 0 ]] || die "Run as ubuntu, not root."
command -v docker >/dev/null || die "docker is not installed on this host."
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is missing."
[[ -f "$APP_DIR/.env" ]] || die "$APP_DIR/.env is missing — the containers load it via env_file and will not start."

# A build needs room for the image, its layer cache and node_modules twice over.
# A previous release died half-way through on a full disk and left the service
# down; the images are the thing that fills this disk, so check before adding one.
avail_mb=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
[[ "$avail_mb" -gt 4096 ]] || die "Only ${avail_mb}MB free. Reclaim space first: docker image prune -a"

# ------------------------------------------------------------------- source --
log "Syncing source to $REF"
if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  mkdir -p "$SOURCE_DIR"
  git clone "$REPO_URL" "$SOURCE_DIR"
fi
git -C "$SOURCE_DIR" fetch --prune origin
git -C "$SOURCE_DIR" checkout -qf "$REF" --detach 2>/dev/null || git -C "$SOURCE_DIR" checkout -qf "origin/$REF" --detach
SHA="$(git -C "$SOURCE_DIR" rev-parse --short HEAD)"
SUBJECT="$(git -C "$SOURCE_DIR" log -1 --pretty=%s)"
log "Deploying ${SHA} — ${SUBJECT}"

# The tag currently running, captured BEFORE anything changes. This is the whole
# rollback story: an image that already exists locally and already worked.
PREVIOUS="$(docker inspect -f '{{ index .Config.Labels "plumo.sha" }}' plumo-api 2>/dev/null || true)"
[[ -n "$PREVIOUS" ]] && log "Currently running: ${PREVIOUS}" || warn "No running container found — first container deploy."

# -------------------------------------------------------------------- build --
cd "$SOURCE_DIR/backend"
log "Building images (${SHA})"
docker build --target runtime  --label "plumo.sha=${SHA}" -t "plumo-cs:${SHA}"         .
docker build --target migrate  --label "plumo.sha=${SHA}" -t "plumo-cs-migrate:${SHA}" .

# `docker build` succeeding proves the layers assemble, not that the thing inside
# runs. Both entrypoints, because api and worker share one image and differ only
# in which file they start.
docker run --rm --entrypoint node "plumo-cs:${SHA}" \
  -e "require('fs').accessSync('/app/dist/main.js');require('fs').accessSync('/app/dist/worker.js')" \
  || die "The built image is missing dist/main.js or dist/worker.js"

# ----------------------------------------------------------------- migrate ---
# Explicit, gated, and backed up. A deploy that quietly migrates is a deploy that
# can quietly destroy data, and this database has one irreversible migration in
# its history for exactly that reason.
export PLUMO_TAG="${SHA}"
pending=$(docker compose -f "$COMPOSE" run --rm --entrypoint sh migrate -c \
  'DATABASE_URL="$MIGRATE_DATABASE_URL" node_modules/.bin/prisma migrate status' 2>&1 \
  | grep -ci 'not yet been applied\|following migration' || true)

if [[ "$pending" -gt 0 ]]; then
  if [[ "${WITH_MIGRATIONS:-0}" == "1" ]]; then
    if [[ -x /opt/plumo-cs/ops/pg-backup.sh ]]; then
      log "Backing up the database first"
      /opt/plumo-cs/ops/pg-backup.sh || die "Backup failed — refusing to migrate."
    else
      warn "pg-backup.sh not found — migrating WITHOUT a fresh backup."
    fi
    log "Applying migrations"
    docker compose -f "$COMPOSE" run --rm migrate || die "Migration failed. Nothing has been restarted; the old containers are still serving."
  else
    die "There are unapplied migrations. Review them, then re-run with WITH_MIGRATIONS=1."
  fi
fi

# ------------------------------------------------------------------- start ---
log "Starting api and worker on ${SHA}"
docker compose -f "$COMPOSE" up -d --remove-orphans api worker

# --------------------------------------------------------------- healthcheck --
# The point of the script. "The container started" and "the service answers" are
# different claims: a missing DI provider starts cleanly and 502s every caller,
# and a Prisma engine mismatch passes a health check that touches no database and
# then fails every query.
log "Waiting for $HEALTH_URL"
healthy=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  warn "Health check failed after 60s."
  if [[ -n "$PREVIOUS" ]] && docker image inspect "plumo-cs:${PREVIOUS}" >/dev/null 2>&1; then
    warn "Rolling back to ${PREVIOUS}"
    PLUMO_TAG="$PREVIOUS" docker compose -f "$COMPOSE" up -d api worker
    for _ in $(seq 1 30); do
      curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1 && \
        die "Rolled back to ${PREVIOUS}, which is healthy. ${SHA} is NOT deployed. Logs: docker compose -f $COMPOSE logs --tail 100 api"
      sleep 2
    done
    die "ROLLBACK ALSO UNHEALTHY — the service is down. docker compose -f $COMPOSE logs --tail 100 api"
  fi
  die "No previous image to roll back to. Service is down. docker compose -f $COMPOSE logs --tail 100 api"
fi

# A worker that exited is invisible from an HTTP probe — it serves nothing, so
# nothing 502s. Its jobs simply stop happening, which is how a broken worker went
# unnoticed for a fortnight once already.
docker compose -f "$COMPOSE" ps --status running --services | grep -qx worker \
  || die "api is healthy but the worker is not running. docker compose -f $COMPOSE logs --tail 100 worker"

log "Deployed ${SHA} — healthy"
echo "    ${SUBJECT}"
[[ -n "$PREVIOUS" ]] && echo "    rollback: PLUMO_TAG=${PREVIOUS} docker compose -f $COMPOSE up -d api worker"
echo "    native fallback: bash $SOURCE_DIR/backend/ops/deploy-native.sh"
