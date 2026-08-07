#!/usr/bin/env bash
#
# Deploy the API and worker onto the systemd host.
#
# THIS EXISTS BECAUSE THERE WAS NO DEPLOY AT ALL. The only workflow in the repo
# is backend-ci.yml, which tests and never ships, and /opt/plumo-cs/app is not a
# git checkout — so every release so far has been hand-copied. On 2026-08-07 a
# commit sat on origin/main for an hour while both of us believed it was live,
# and the only reason we found out was grepping the built dist on the server.
# A deploy you have to remember to do by hand is a deploy that silently does not
# happen.
#
# Distinct from ops/deploy.sh, which targets the container topology that was
# written but never adopted. THIS is the one that matches production today:
# native node, native postgres, two systemd units.
#
# Usage, on the server:
#   bash /opt/plumo-cs/source/backend/ops/deploy-native.sh              # origin/main
#   bash /opt/plumo-cs/source/backend/ops/deploy-native.sh v1.2.3       # any ref
#   WITH_MIGRATIONS=1 bash .../deploy-native.sh                         # see below
#
# Safe to re-run. Safe to run when already up to date.

set -Eeuo pipefail

REPO_URL="https://github.com/firasbelhiba/plumocs.git"
SOURCE_DIR="/opt/plumo-cs/source"
APP_DIR="/opt/plumo-cs/app"
HEALTH_URL="http://127.0.0.1:3002/health"
UNITS=(plumo-api.service plumo-worker.service)
REF="${1:-origin/main}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn] %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m[FAIL] %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight --
# Every one of these has bitten this project at least once.

[[ $EUID -ne 0 ]] || die "Run as ubuntu, not root — the app files are ubuntu-owned and root would leave them unreadable by the service."
[[ -d "$APP_DIR" ]] || die "$APP_DIR does not exist. This is not the production host."
[[ -f "$APP_DIR/.env" ]] || die "$APP_DIR/.env is missing. The units load it via EnvironmentFile and will not start without it."

# A build needs room for node_modules plus two copies of dist. A previous deploy
# died half-way through on a full disk and left the service down.
avail_mb=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
[[ "$avail_mb" -gt 2048 ]] || die "Only ${avail_mb}MB free on $APP_DIR. Free space before deploying (docker image prune -a, or clear old backups)."

command -v node >/dev/null || die "node is not on PATH"
node_major=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
[[ "$node_major" == "22" ]] || warn "node $(node -v) — CI and this host were built on v22. A different major is a weaker signal than it looks."

# ------------------------------------------------------------------- source --
log "Syncing source to $REF"
if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  mkdir -p "$SOURCE_DIR"
  git clone "$REPO_URL" "$SOURCE_DIR"
fi
git -C "$SOURCE_DIR" fetch --prune origin
git -C "$SOURCE_DIR" checkout -f "$REF" --detach
DEPLOY_SHA="$(git -C "$SOURCE_DIR" rev-parse --short HEAD)"
DEPLOY_SUBJECT="$(git -C "$SOURCE_DIR" log -1 --pretty=%s)"
log "Deploying ${DEPLOY_SHA} — ${DEPLOY_SUBJECT}"

# Copy the tree the app is built from. --delete so a file deleted in git is
# deleted here; without it, a removed module lingers in dist forever.
#
# .env, node_modules, dist and dist.prev are excluded deliberately: .env is host
# state that is not in git, and the other three are build products this script
# manages itself.
log "Updating $APP_DIR"
rsync -a --delete \
  --exclude '.env' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'dist.prev/' \
  "$SOURCE_DIR/backend/" "$APP_DIR/"

# ----------------------------------------------------------------- migrate ---
# Schema changes are NOT applied silently. A deploy that quietly migrates is a
# deploy that can quietly destroy data, and this database has one irreversible
# migration in its history that is hard-blocked for exactly that reason.
cd "$APP_DIR"
pending=$(npx prisma migrate status 2>&1 | grep -ci 'following migration.*not.*applied\|have not yet been applied' || true)
if [[ "$pending" -gt 0 ]]; then
  if [[ "${WITH_MIGRATIONS:-0}" == "1" ]]; then
    log "Applying pending migrations"

    # The credential normally lives in app/.env, not the deploying shell. Read it
    # from there rather than making every caller export it by hand — and with
    # `cut -d= -f2-` so a password containing '=' survives. An explicit
    # environment variable still wins, for one-off restores against another host.
    if [[ -z "${MIGRATE_DATABASE_URL:-}" && -f "$APP_DIR/.env" ]]; then
      MIGRATE_DATABASE_URL="$(grep -E '^MIGRATE_DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/; s/^'"'"'\(.*\)'"'"'$/\1/')"
    fi
    [[ -n "${MIGRATE_DATABASE_URL:-}" ]] || die "Pending migrations need MIGRATE_DATABASE_URL (the plumo_migrator role). plumo_app owns nothing and cannot run DDL."

    # A backup before DDL, always. This is production data and a migration is the
    # one deploy step that cannot be undone by swapping dist back.
    if [[ -x /opt/plumo-cs/ops/pg-backup.sh ]]; then
      log "Backing up the database first"
      /opt/plumo-cs/ops/pg-backup.sh || die "Backup failed — refusing to migrate."
    else
      warn "ops/pg-backup.sh not found or not executable — migrating WITHOUT a fresh backup."
    fi

    DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy
  else
    die "There are unapplied migrations. Take a backup (ops/pg-backup.sh), review them, then re-run with WITH_MIGRATIONS=1."
  fi
fi

# ------------------------------------------------------------------- build ---
log "Installing dependencies"
npm ci

# Must precede the build: the app imports types from the generated client.
log "Generating Prisma client"
npx prisma generate

# The rollback point. Taken before the build, not after, so a build that fails
# half-way still leaves a known-good dist to restore.
if [[ -d dist ]]; then
  rm -rf dist.prev
  cp -a dist dist.prev
fi

log "Building"
npm run build

# Proves the artifact is real before anything is restarted. `nest build` exiting
# 0 with no dist/main.js has happened.
[[ -f dist/main.js ]] || die "Build produced no dist/main.js"

# ----------------------------------------------------------------- restart ---
log "Restarting ${UNITS[*]}"
sudo systemctl restart "${UNITS[@]}"

# --------------------------------------------------------------- healthcheck --
# The whole point of the script. A restart that "succeeded" and a service that
# actually serves requests are different claims — a missing DI provider starts
# systemd cleanly and returns 502 to every caller, which is precisely how this
# app put a 502 in production once.
log "Waiting for $HEALTH_URL"
healthy=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  warn "Health check failed after 60s — rolling back to the previous build."
  if [[ -d dist.prev ]]; then
    rm -rf dist
    mv dist.prev dist
    sudo systemctl restart "${UNITS[@]}"
    for i in $(seq 1 30); do
      if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
        die "Rolled back to the previous build, which is healthy. ${DEPLOY_SHA} is NOT deployed. Logs: journalctl -u plumo-api -n 100"
      fi
      sleep 2
    done
    die "ROLLBACK ALSO UNHEALTHY — the service is down. journalctl -u plumo-api -n 100"
  fi
  die "No dist.prev to roll back to. The service is down. journalctl -u plumo-api -n 100"
fi

for u in "${UNITS[@]}"; do
  systemctl is-active --quiet "$u" || die "$u is not active after deploy. journalctl -u $u -n 100"
done

log "Deployed ${DEPLOY_SHA} — healthy"
echo "    ${DEPLOY_SUBJECT}"
echo "    rollback: cd $APP_DIR && rm -rf dist && mv dist.prev dist && sudo systemctl restart ${UNITS[*]}"
