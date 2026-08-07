# Plumo CS — API, worker, and migration runner from one image.
#
# Node 22 to match what production has been running (v22.22.1). The previous
# version of this file pinned node:20 and had never built this app for real.
# Containerising and changing the runtime version at once would put two
# variables in one cutover; if something broke you would not know which.
#
# One image, three entrypoints — the API and the worker are the same code
# differing only in what they start, exactly as the two systemd units do today.
# Separate images would let them drift.

# ---------------------------------------------------------------------------
# deps — production node_modules only, cached on package*.json alone
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# build — full dependency tree; compiles TypeScript, generates Prisma client
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# openssl BEFORE `prisma generate`, and that ordering is the whole point.
#
# `prisma generate` picks its engine from the openssl it can detect AT GENERATE
# TIME. On a bare alpine it detects none, falls back to the "linux-musl" engine,
# and bakes that choice into node_modules/.prisma. The runtime and migrate stages
# then install openssl — so they ask for "linux-musl-openssl-3.0.x", the engine
# that was never generated, and every query dies with:
#
#   Prisma Client could not locate the Query Engine for runtime
#   "linux-musl-openssl-3.0.x" ... generated for "linux-musl"
#
# Installing it here makes generate and runtime agree, which is why this is the
# fix rather than pinning binaryTargets in schema.prisma: the schema is shared
# with CI and with development machines that are neither alpine nor musl, and
# hard-coding one deployment's target there would be a footgun aimed at everyone
# else. Nothing about the image is special once the environments simply match.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# migrate — the schema runner
#
# A separate target because `prisma` is a devDependency: the runtime image is
# installed with --omit=dev and physically cannot run `prisma migrate deploy`.
# The old Dockerfile had no answer for this, so migrations would have quietly
# remained a manual host step after cutover.
#
# Run as its own compose service using MIGRATE_DATABASE_URL (the plumo_migrator
# role), while the runtime containers connect as plumo_app and stay unable to
# alter schema. That separation is the entire point of the split roles and has
# to survive containerisation.
# ---------------------------------------------------------------------------
FROM build AS migrate
WORKDIR /app

# USER DOES NOT CHANGE HOME. Docker leaves HOME at /root when you switch user,
# and /root is mode 700 — so uid 1000 cannot write it. npm's cache defaults to
# $HOME/.npm, so `npx prisma` died with EACCES before Prisma ever started, and
# so would anything else that caches. The `runtime` stage never hit this because
# serving traffic writes nothing.
#
# This was not theoretical: `prisma --version` failed in CI on this exact image.
# Left unfound, it would have surfaced as the first migration after cutover
# failing — the one moment with the least appetite for a surprise.
ENV HOME=/home/node

# Two things Prisma needs that alpine does not give it, both found by running
# this image rather than by reading it:
#
#   openssl — the engines are dynamically linked against libssl. Without it the
#   CLI warns "failed to detect the libssl/openssl version, defaulting to
#   openssl-1.1.x" and loads an engine that may not match the image at all.
#
#   ownership — the engines directory is written to at startup, and every layer
#   in `build` ran as root, so /app/node_modules/@prisma is root-owned while this
#   stage runs as uid 1000. The exact failure was
#   "Can't write to /app/node_modules/@prisma/engines".
#
# Scoped to @prisma and .prisma rather than chown -R /app: recursively chowning
# the whole dependency tree copies several hundred megabytes into a new layer for
# no benefit.
RUN apk add --no-cache openssl \
 && chown -R node:node /app/node_modules/@prisma /app/node_modules/.prisma

# Non-root here too. This container holds the schema-owner credential, so it is
# the most dangerous one in the stack — root inside it was the weakest link.
USER node

# The binary directly, not `npx`. npx resolves through the npm cache even for a
# package that is already installed locally, which is a writable directory this
# container has no other reason to need. Calling the bin removes the dependency
# entirely; the CLI is a devDependency and is present because this stage is
# FROM build, not from the --omit=dev tree.
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# runtime — what actually serves traffic
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# tini gives a real PID 1, so SIGTERM reaches node and in-flight requests drain
# instead of the container being SIGKILLed when the stop grace period expires.
#
# openssl is NOT optional and is not about the CLI. The Prisma QUERY ENGINE this
# image loads on the first database call is dynamically linked against libssl,
# and alpine ships without it — the same missing package that made the migrate
# stage warn "failed to detect the libssl/openssl version". Absent here, the API
# builds, starts, passes a health check that touches no database, and then fails
# on the first real query. That is a cutover discovering it in production.
RUN apk add --no-cache tini openssl

COPY --from=deps  /app/node_modules ./node_modules
# The generated Prisma client lives in node_modules/.prisma and is NOT produced
# by `npm ci --omit=dev`. Without this copy the app throws "@prisma/client did
# not initialize yet" on the first query.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
# Migrations ship in the runtime image too, so a running container can be
# inspected to see which schema version it expects.
COPY prisma ./prisma
COPY package.json ./

# node:alpine ships an unprivileged `node` user (uid 1000). Running as root in
# the container would undo the User=ubuntu the systemd units enforce today.
USER node

# Matches the port nginx proxies to (127.0.0.1:3002). Documentation only —
# under network_mode: host the app binds the host port directly.
EXPOSE 3002

# NO HEALTHCHECK HERE ON PURPOSE.
#
# One image serves both the API and the worker. A healthcheck baked in here is
# inherited by both — and the worker serves no HTTP at all (it is a
# createApplicationContext process, no listener). Under network_mode: host a
# probe of 127.0.0.1:3002 from the worker container is answered by the API, so
# the worker would report the API's health as its own and could never go
# unhealthy. A health signal that cannot fail is worse than none: it makes
# `docker compose ps` lie.
#
# The probe is declared per-service in docker-compose.prod.yml instead, on the
# service that actually listens.

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
