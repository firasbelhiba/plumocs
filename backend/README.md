# Plumo CS — Backend

NestJS 10 (TypeScript) over PostgreSQL 16, running as **two processes from one codebase**:

- **API service** — HTTP (Fastify) + WebSocket, the request path
- **Worker** — BullMQ processors for background jobs (email, webhooks, SLA sweep, search indexing, notifications, daily export)

Design rules: **API-first**, **one database**, **enqueue, don't block**.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | NestJS 10 + Fastify |
| Database | PostgreSQL 16 via Prisma |
| Queue / cache | BullMQ on Redis 7 |
| Auth | JWT (access + refresh, argon2) for people; scoped API keys for machines |
| Object storage | S3-compatible (MinIO locally), presigned URLs |
| Email | Nodemailer SMTP out; inbound webhook (+ mailparser) in |
| Docs | OpenAPI at `/api/docs` |
| Logging | Pino, structured JSON with request ids |

## Local development

```bash
docker compose up -d           # postgres, redis, minio, mailhog
npm install
cp .env.example .env           # fill in secrets (defaults work with compose)
npm run db:roles               # create plumo_migrator + plumo_app (see below)
npx prisma migrate deploy      # apply migrations as plumo_migrator
npm run seed                   # dev dataset matching the frontend
npm run start:api:dev          # API at :3002, docs at /api/docs
npm run start:worker:dev       # background worker (separate terminal)
```

MailHog captures outbound email at http://localhost:8025. MinIO console at http://localhost:9001.

**Dev logins** (password `password123`): `priya@plumo.app` (admin) · `mira@plumo.app` (lead) · `tomas@plumo.app` (agent).

## Database roles

Three roles, and the separation is load-bearing rather than hygiene:

| role | used by | can it ignore row-level security? |
| --- | --- | --- |
| superuser (`plumo`, `postgres`, …) | `npm run db:roles` only | yes — never a connection string |
| `plumo_migrator` | Prisma Migrate, via `MIGRATE_DATABASE_URL` | as the table owner, yes unless the table is `FORCE`d |
| `plumo_app` | the API and the worker, via `DATABASE_URL` | **no** — not a superuser, no `BYPASSRLS`, owns nothing |

Postgres exempts a superuser from every policy unconditionally, and a table's
owner from every policy unless that table also carries `FORCE ROW LEVEL
SECURITY`. Both exemptions are silent: policies install without error, queries
return without warning, and isolation tests pass while nothing is enforced.
Running the application as `plumo_app` is what turns row-level security from
documentation into a guarantee.

So this is checked rather than assumed, in two places:

- `PrismaService.onModuleInit` refuses to start the API or worker on a
  privileged connection. There is deliberately no override flag.
- `test/integration/global-setup.ts` refuses to run the integration suite on
  one, so no isolation test can ever pass trivially.

`prisma/sql/roles.sql` is idempotent and doubles as the provisioning script for
a new environment. It must run as a superuser, since it creates the other two
roles:

```bash
SUPERUSER_DATABASE_URL=postgresql://postgres@host/plumo_cs \
PLUMO_APP_PASSWORD=…  PLUMO_MIGRATOR_PASSWORD=…  npm run db:roles
```

On managed Postgres (RDS, Neon, Supabase) the admin role you are given plays the
superuser part; `plumo_migrator` and `plumo_app` are created underneath it
exactly as here.

## Tests

```bash
npm test              # unit — state machine, business-hours math, SLA timers
npm run test:integration  # against a real Postgres, as plumo_app
npm run test:all      # both
npm run test:e2e      # e2e against a running Postgres (see test/)
```

## Project structure

```
prisma/            schema.prisma, migrations, sql extras, seed
src/
  main.ts          API bootstrap (HTTP + WS)
  worker.ts        worker bootstrap (BullMQ processors + repeatable jobs)
  common/          guards, filters, decorators, permissions.ts (the RBAC matrix)
  config/          typed config + env validation (boot fails on missing vars)
  queue/           BullMQ registration + the QueueProducer
  auth/ users/ teams/ organizations/ customers/
  tickets/         core: list/filter, state machine, bulk, assignment
  messages/        replies + internal notes, first-response stamping
  attachments/     presigned upload/download (S3/MinIO)
  sla/             policies, business-hours math, pause/resume
  tags/ canned-responses/ webhooks/ api-keys/
  email/           outbound SMTP + inbound webhook parsing/threading
  notifications/ audit/ search/ integrations/ realtime/ health/
  worker-jobs/     all queue processors
```

## API sketch

REST over HTTPS, versioned `/api/v1`, OpenAPI at `/api/docs`.

- `POST /auth/login|refresh|logout|forgot-password|reset-password`, `GET /auth/me`
- `POST|GET /tickets` (offset or cursor pagination), `GET|PATCH /tickets/:id`, `POST /tickets/:id/assign|status|messages|merge`, `POST /tickets/bulk`, `GET /tickets/:id/audit`
- `GET|POST /customers`, `GET|PATCH /customers/:id`, organizations CRUD
- Lead/admin config: `/users /teams /sla-policies /business-hours /canned-responses /tags /webhooks /api-keys`
- `POST /attachments/presign`, `GET /attachments/:id/url`
- `GET /search?q=`, `GET /notifications`, `GET /integrations/metrics`, `POST /integrations/export/run`
- `GET /reports/summary|volume|by-channel|by-agent` — role-scoped (agent: own, lead: team, admin: instance)
- `GET /health`, `GET /ready`

Machines authenticate with `X-Api-Key` and scoped grants (`tickets:read`, `tickets:write`, `customers:*`, `exports:run`, `reports:read`, `webhooks:manage`). Humans use `Authorization: Bearer`.

## The state machine

```
new ──▶ open ──▶ pending ──▶ open ──▶ resolved ──▶ closed
         │         │                     ▲   │
         └──▶ on_hold ──▶ open           └───┘ (reopened, lead+)
```

Illegal transitions return `422 TICKET_INVALID_TRANSITION`. Entering `pending`/`on_hold` pauses the SLA clock; returning to `open` extends the due times by the paused duration.

## Error envelope

```json
{ "error": { "code": "TICKET_INVALID_TRANSITION", "message": "…", "details": {} },
  "requestId": "…" }
```
