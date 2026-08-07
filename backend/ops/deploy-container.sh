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

# ------------------------------------------------- compose is even usable? --
# EVERYTHING BELOW DEPENDS ON THIS, AND IT IS WHY PRODUCTION WENT DOWN.
#
# `docker compose` interpolates ${MIGRATE_DATABASE_URL} from the SHELL. env_file
# passes variables INTO a container; it does not define them for substitution
# while the YAML is being parsed. The variable lives only in app/.env, so compose
# refused to parse the file at all — and therefore `up api worker` failed too,
# even though only the migrate service references it.
#
# Exported here, and `compose config -q` proves the whole file resolves BEFORE
# anything irreversible happens. Cheap, and it turns the exact failure that
# caused an outage into an abort with the service still running.
export PLUMO_TAG="${SHA}"
if [[ -z "${MIGRATE_DATABASE_URL:-}" ]]; then
  # cut -d= -f2- so a password containing '=' survives; the sed strips optional
  # surrounding quotes.
  MIGRATE_DATABASE_URL="$(grep -E '^MIGRATE_DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/; s/^'"'"'\(.*\)'"'"'$/\1/')"
  export MIGRATE_DATABASE_URL
fi
[[ -n "${MIGRATE_DATABASE_URL:-}" ]] || die "MIGRATE_DATABASE_URL is not in $APP_DIR/.env. compose cannot interpolate it and will not parse."

log "Validating the compose file resolves"
docker compose -f "$COMPOSE" config -q || die "compose config failed. Nothing has been stopped; the native stack is still serving."

# ------------------------------------------------- does the image even run? --
# PROVE THE BUILD SERVES BEFORE STOPPING WHAT CURRENTLY DOES.
#
# The containers use network_mode: host and bind 3002, which systemd is holding,
# so they cannot be started alongside the running service to test them. The image
# can — on a spare port, against the real database and the real env. That closes
# the gap that made the last deploy dangerous: previously the first evidence the
# new build worked arrived AFTER production had been stopped.
#
# This catches a missing DI provider, an unreadable Prisma engine, a bad env —
# every failure mode that a `docker build` exit code cannot see.
SMOKE_PORT=3099
log "Smoke-testing ${SHA} on port ${SMOKE_PORT} while production keeps serving"
smoke_id=$(docker run -d --network host --env-file "$APP_DIR/.env" -e "PORT=${SMOKE_PORT}" "plumo-cs:${SHA}")
smoke_ok=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${SMOKE_PORT}/health" >/dev/null 2>&1; then smoke_ok=1; break; fi
  sleep 2
done
if [[ "$smoke_ok" -ne 1 ]]; then
  warn "Smoke test failed. Container logs:"
  docker logs --tail 40 "$smoke_id" 2>&1 || true
  docker rm -f "$smoke_id" >/dev/null 2>&1 || true
  die "${SHA} does not serve. NOTHING WAS STOPPED — the native stack is still up."
fi
docker rm -f "$smoke_id" >/dev/null 2>&1 || true
log "Smoke test passed"

# ----------------------------------------------------------------- migrate ---
# Explicit, gated, and backed up. A deploy that quietly migrates is a deploy that
# can quietly destroy data, and this database has one irreversible migration in
# its history for exactly that reason.
#
# NO `|| true` ON THIS PIPELINE. The previous version swallowed a failing compose
# invocation here, concluded there was nothing to migrate, and carried on to stop
# production — the error it hid was the very one that then killed the deploy.
migrate_status="$(docker compose -f "$COMPOSE" run --rm --entrypoint sh migrate -c \
  'DATABASE_URL="$MIGRATE_DATABASE_URL" node_modules/.bin/prisma migrate status' 2>&1)" || {
    echo "$migrate_status"
    die "Could not read migration status. Nothing has been stopped."
  }
pending=$(printf '%s' "$migrate_status" | grep -ci 'not yet been applied\|following migration' || true)

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
# STOP THE NATIVE UNITS FIRST, and this is not tidiness.
#
# The compose services run with network_mode: host, so the API container binds
# host port 3002 — the port plumo-api.service is already holding. The container
# would fail to bind and exit, and the health check below would STILL PASS,
# because the old systemd process is there answering it. A false green, on the
# one step whose entire job is to tell the truth about whether the new build
# works.
#
# Disabled as well as stopped: a host reboot with both enabled would race, and
# whichever won would be a coin toss. deploy-native.sh re-enables them, which is
# what makes the fallback at the end of this script real.
if systemctl is-enabled --quiet plumo-api.service 2>/dev/null || systemctl is-active --quiet plumo-api.service 2>/dev/null; then
  log "Stopping the native systemd units (they hold port 3002)"
  sudo systemctl disable --now plumo-api.service plumo-worker.service || die "Could not stop the native units; refusing to start containers that cannot bind."
  NATIVE_WAS_RUNNING=1
else
  NATIVE_WAS_RUNNING=0
fi

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

  # Nothing to roll back to in containers — this is the first container deploy,
  # or the previous image is gone. Put the native stack back rather than leaving
  # the site down: it was serving traffic ninety seconds ago and is known good.
  if [[ "${NATIVE_WAS_RUNNING:-0}" == "1" ]]; then
    warn "No previous image. Restoring the native systemd stack."
    docker compose -f "$COMPOSE" down --remove-orphans || true
    sudo systemctl enable --now plumo-api.service plumo-worker.service
    for _ in $(seq 1 30); do
      curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1 && \
        die "Restored the native stack, which is healthy. ${SHA} is NOT deployed. Logs: docker compose -f $COMPOSE logs --tail 100 api"
      sleep 2
    done
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
