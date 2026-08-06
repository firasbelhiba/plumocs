#!/usr/bin/env bash
#
# Build the two tagged images a deploy needs.
#
#   ./build.sh                 build HEAD (refuses a dirty tree)
#   ./build.sh --allow-dirty   build the working tree, tagged dirty-<sha>-<ts>
#
# Produces:
#   plumo-cs:<tag>          --target runtime   (api + worker)
#   plumo-cs-migrate:<tag>  --target migrate   (prisma CLI; devDeps included)
#
# Two images because `prisma` is a devDependency: the runtime image is installed
# with --omit=dev and cannot run `prisma migrate deploy`.
#
# THE TAG IS DERIVED FROM GIT, NOT PASSED IN. An earlier version took the tag as
# an argument and built whatever happened to be in the working tree, so
# `plumo-cs:9f3a1c2` could contain uncommitted code that exists nowhere in
# history. Rollback addresses builds by tag; if a tag does not identify a
# commit, "roll back to the previous tag" restores something nobody can
# reconstruct or review. A dirty build is still possible, but it is opt-in and
# is tagged so it can never be mistaken for a commit.
set -euo pipefail

ALLOW_DIRTY=no
[ "${1:-}" = "--allow-dirty" ] && ALLOW_DIRTY=yes

CTX=$(cd "$(dirname "$0")/.." && pwd)   # the backend/ directory
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

SHA=$(git -C "$CTX" rev-parse --short HEAD)
DIRTY=$(git -C "$CTX" status --porcelain -- "$CTX" | head -1)

if [ -n "$DIRTY" ] && [ "$ALLOW_DIRTY" = no ]; then
  echo "Working tree is dirty; refusing to build a sha-tagged image from it." >&2
  echo "Uncommitted changes under backend/:" >&2
  git -C "$CTX" status --short -- "$CTX" >&2
  echo >&2
  echo "Commit them, or run: $0 --allow-dirty" >&2
  exit 1
fi

if [ "$ALLOW_DIRTY" = yes ] && [ -n "$DIRTY" ]; then
  TAG="dirty-${SHA}-$(date -u +%Y%m%dT%H%M%SZ)"
  say "DIRTY BUILD — tag $TAG does not correspond to any commit"
else
  TAG="$SHA"
fi

say "Building plumo-cs:$TAG (runtime) from $CTX"
docker build --target runtime \
  --label "org.opencontainers.image.revision=$SHA" \
  --label "plumo.build.dirty=$([ -n "$DIRTY" ] && echo true || echo false)" \
  -t "plumo-cs:$TAG" "$CTX"

say "Building plumo-cs-migrate:$TAG"
docker build --target migrate \
  --label "org.opencontainers.image.revision=$SHA" \
  -t "plumo-cs-migrate:$TAG" "$CTX"

# --- prove the image is what we think it is --------------------------------
# Every check must be able to FAIL. The previous version used
# `test -f x && echo ok`, which under `set -e` does not abort when the test
# fails — a non-final command in an && list is exempt. So an image missing
# dist/main.js verified clean and would only reveal itself as a crash-looping
# container after the old service had been stopped.
say "Verifying the runtime image"
docker run --rm --entrypoint sh "plumo-cs:$TAG" -c '
  set -eu
  fail() { echo "MISSING: $1" >&2; exit 1; }
  [ -f dist/main.js ]            || fail dist/main.js
  [ -f dist/worker.js ]          || fail dist/worker.js
  [ -d node_modules/.prisma ]    || fail node_modules/.prisma
  [ -d prisma/migrations ]       || fail prisma/migrations
  # The build must not have captured a secret. .dockerignore is the guard;
  # this asserts the guard actually held.
  found=$(find / -xdev \( -name ".env" -o -name "*.pem" -o -name "*.dump" \) 2>/dev/null | head -3 || true)
  [ -z "$found" ] || { echo "SECRET-LIKE FILES IN IMAGE:"; echo "$found"; exit 1; }
  echo "node:       $(node -v)"
  echo "user:       $(id -un) ($(id -u))"
  echo "migrations: $(ls prisma/migrations | wc -l) dirs"
  echo "all checks passed"
'

say "Built"
docker images --filter "reference=plumo-cs*:$TAG" \
  --format '  {{.Repository}}:{{.Tag}}  {{.Size}}'
echo
echo "Deploy with:  ./ops/deploy.sh $TAG"
