# Plumo CS

Customer-support console: shared inbox, SLA tracking, and an ingest API for
third-party chatbots.

| | |
| --- | --- |
| `backend/` | NestJS 10 + Fastify, Prisma, PostgreSQL, BullMQ on Redis |
| `frontend/` | Next.js 15 console |
| `design-src/` | the original design source the console was built from |

## Running it locally

Backend — see [backend/README.md](backend/README.md) for the full walkthrough,
including the database roles, which are load-bearing rather than hygiene:

```bash
cd backend
cp .env.example .env
npm install
npm run db:roles         # creates plumo_migrator and plumo_app
npx prisma migrate deploy
npm run seed
npm run start:api:dev    # :3002, docs at /api/docs
npm run start:worker:dev # separate terminal
```

Frontend:

```bash
cd frontend
cp .env.example .env.local   # point NEXT_PUBLIC_API_URL at the backend
npm install
npm run dev
```

## Tests

```bash
cd backend && npm run test:all
```

Unit tests mock Prisma; the integration suite runs against a real PostgreSQL and
refuses to start on a database connection that can bypass row-level security —
otherwise isolation tests would pass while proving nothing.

## Things worth knowing before changing the schema

- **Never apply `prisma migrate diff` output.** Several objects are invisible to
  the Prisma schema — the `search_tsv` column with its trigger and GIN index,
  `ticket_number_seq`, and the partial unique indexes on `customers` — so a
  generated diff proposes dropping all of them. Migrations here are hand-written.
- **The app connects as a non-owner role** (`plumo_app`) that cannot bypass
  row-level security, and refuses to boot as anything else. See
  `backend/prisma/sql/roles.sql`.

## Chatbot integration

Partner-facing contract: [backend/docs/chatbot-integration.md](backend/docs/chatbot-integration.md).

## Status

Single-tenant. Workspace tenancy and row-level security are not yet implemented,
so this runs **one organisation at a time**.
