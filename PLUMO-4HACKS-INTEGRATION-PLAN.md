# 4hacks Learning → Plumo CS Support Integration Plan

> Wire the 4hacks `/support` flow into Plumo CS: a support submission → 4hacks NestJS backend → Plumo `POST /api/v1/tickets` (scoped API key) → staff work it in the Plumo console. Optional two-way: Plumo webhooks → 4hacks so users see status/replies in-app. Grounded in a 6-reader map of both codebases; every claim cites source.

## 1. Architecture & data flow

Every submission routes through the 4hacks **NestJS backend** (never the browser) which holds the Plumo API key and calls Plumo server-to-server.

```
User → /support form → 4hacks backend POST /api/support/tickets (SessionAuthGuard)
  → PlumoService (X-Api-Key) → Plumo POST /api/v1/tickets → 201 {id, number, status}
  → staff work it in the Plumo console
[two-way] Plumo worker → webhook (x-plumo-signature HMAC) → 4hacks POST /api/support/webhooks/plumo
  → update local SupportTicket → user sees status in-app
```

Plumo API-key visibility is **instance-wide** (no org scoping — `team-scope.service.ts` returns `{}` for api_key principals), so 4hacks correlates tickets by the `id`/`number` it stores at create time, never by trusting Plumo to isolate them.

## 2. Exact Plumo contracts

### Create ticket — `POST /api/v1/tickets` (→ 201)
Route: `@AllowApiKey() @Scopes('tickets:write')` (`tickets.controller.ts:17-22`); global prefix `api/v1` (`main.ts:24`). ValidationPipe is `whitelist + forbidNonWhitelisted` → extra fields 400.
Headers: `X-Api-Key: plumo_sk_<hex>`, `Content-Type: application/json`.

| Field | Type | Notes |
|---|---|---|
| `subject` | string | **required** |
| `customerEmail` | email | required unless `customerId`; find-or-create by email |
| `customerId` | uuid | XOR with `customerEmail` |
| `customerName` | string? | used only when creating a new customer |
| `priority` | `low\|normal\|high\|urgent`? | default `normal` |
| `channel` | `email\|api\|widget\|hashcare\|manual`? | default `api`; **no `4hacks` value** (400s) |
| `teamId` / `assigneeId` | uuid? | routing; else default team / round-robin |
| `tags` | string[]? | e.g. `['4hacks','support']` |
| `body` | string? | **user's message → stored as the first customer message** |
| `sourceRef` | string? | stash 4hacks id, e.g. `4hacks:req_abc123` |

The single POST opens the ticket AND records the first message when `body` is set (`tickets.service.ts:35-111`, `authorType:'customer'`). **Do not** use `POST /tickets/:id/messages` for the opening message — from an api_key it records `authorType:'system'`. Response = `serialize(ticket)` (no message thread); **persist `id` + `number`** (only reliable correlation key; webhooks omit `sourceRef`/email). Read-back: `GET /api/v1/tickets/:id` (`tickets:read`, returns `messages`).

### Machine auth
- Header **`X-Api-Key`** (NOT `Authorization: Bearer` — that's JWT-only, 401s). `auth.guard.ts:30-34,61-71`.
- Secret `plumo_sk_`+hex, stored as SHA-256 + 12-char prefix, **shown once** (`api-keys.module.ts:34-48`).
- Mint (admin human only): `POST /api/v1/api-keys {name, scopes}` with an admin JWT (`POST /api/v1/auth/login`, seed admin `priya@plumo.app`/`password123`).
- Scopes: `['tickets:write']` (create) + `'tickets:read'` (read-back). No inheritance (`permissions.ts:74-82`).
- **Not org-scoped** (`schema.prisma:283`) — a read key sees every ticket in the instance. Keep server-side only.

### Webhooks (two-way only)
- Register (admin human only): `POST /api/v1/webhooks {url, events[], secret?}` — `@Roles('admin')`, **no `@AllowApiKey`** (the key can't self-register; a Plumo admin does it, hands over the once-shown `secret`).
- 6 events: `ticket.created`, `ticket.updated`, `ticket.assigned`, `ticket.resolved`, `message.added`, `sla.breached`.
- Delivery: POST, header `x-plumo-signature: t=<sec>,v1=<hex>`, body `{event, payload, timestamp}`; `hex = HMAC-SHA256(secret, rawBody)` over **exact raw bytes**. 10s timeout, ≤6 retries, no delivery-id header. `processors.ts:97-146`.
- Payloads are thin: `ticket.*` = `{id,number,subject,status,priority,channel,assigneeId,teamId,tags,updatedAt}` (no email/sourceRef); `message.added` = `{ticketId,messageId,authorType,createdAt}` (**no body** → need a `GET /tickets/:id`). Dedupe on payload identity.

## 3. 4hacks-side changes

**Backend — new `support` module (branch: `dev`, VPS):**
- `support.module.ts` (mirror `media.module.ts`; ConfigModule global; PrismaModule only for two-way).
- `plumo.service.ts` — copy `common/geolocation.service.ts` (fetch + `AbortSignal.timeout` + ConfigService + Logger). Header `X-Api-Key`; reads `PLUMO_API_URL`/`PLUMO_API_KEY`. Maps user→customer, message→body, `channel:'api'`, `sourceRef`, `tags`.
- `dto/create-support-ticket.dto.ts` — class-validator, whitelist-strict.
- `support.controller.ts` — `@Controller('support')`, `@Post('tickets')`, `@UseGuards(SessionAuthGuard)`, `@CurrentUser('email'|'id')` → route `POST /api/support/tickets`.
- Register in `app.module.ts`.
- **Trust the session email** (`@CurrentUser('email')`), never the client-typed one. Plumo `findOrCreateByEmail` dedupes (citext) — 4hacks must NOT call `POST /customers`.
- Env: `PLUMO_API_URL`, `PLUMO_API_KEY` (VPS `.env` + `.env.example`). Never `NEXT_PUBLIC_*`.

**Frontend — `/support` (branch: `master`, Vercel):**
- `lib/api.ts`: add `supportApi.createTicket`.
- `app/support/page.tsx`: replace the fake `setTimeout` `onSubmit` (lines 93-99) with `supportApi.createTicket(...)`; keep the submitting/submitted UX, **add an error branch**.

## 4. Deployment prerequisite (the critical-path blocker)

**Plumo is NOT deployed anywhere today** — only a `Dockerfile` + local `docker-compose.yml`, all-localhost `.env`, no CI/host config. There is no URL 4hacks can call. Before anything works, Plumo must be deployed to a reachable host with:
- **PostgreSQL 16** (+ `citext`, `pgcrypto`, `ticket_number_seq`, `npm run db:extras`),
- **Redis 7**, **S3-compatible storage**, **SMTP**,
- a public **HTTPS API URL** (`PLUMO_API_URL`),
- **BOTH processes** — API (`dist/main.js`) AND worker (`dist/worker.js`). *Webhooks/SLA/email run in the worker — no worker = no webhooks (Option B dead).*
- Seed: ≥1 team + 1 active agent (else tickets land unassigned) + an admin to mint the key / register webhooks.

This deployment is the dominant cost of the whole integration.

## 5. Two options

**Option A — one-way (create tickets only).** Plumo deploy + `tickets:write` key + 4hacks support module + form wiring. Users track via Plumo's outbound email or staff use the console.
Effort: Plumo deploy **L** · backend **S** · frontend **S**. Simplest; 4hacks stores nothing; no in-app status; guard double-submits yourself.

**Option B — two-way (create + webhook sync-back).** Everything in A, plus: a `SupportTicket` Prisma model on 4hacks; a public `POST /api/support/webhooks/plumo` with raw-body HMAC verify + dedupe; `tickets:read` key; a Plumo admin registers the webhook + hands over the secret; `GET /tickets/:id` to fetch reply bodies; an in-app status/replies view.
Effort: A + webhook receiver **M** + model/persistence/view **M** + ops **S**. Best UX; needs the worker running; manual webhook registration; every public reply also emails the user (decide whether to suppress Plumo SMTP).

## 6. Open decisions
1. Auth posture: logged-in-only (`SessionAuthGuard`, trusted email — recommended) vs anonymous (`OptionalSessionAuthGuard`, spoofable form email).
2. **Where is Plumo hosted?** (host + managed PG16/Redis/S3/SMTP + public URL) — blocks everything.
3. In-app ticket view? → Option B + `SupportTicket` model. Email tracking enough? → Option A.
4. Two-way: suppress Plumo's SMTP for 4hacks tickets, or accept in-app + email both?
5. Routing: dedicated `teamId`/tags, or default team?
6. Accept the instance-wide key blast radius, or add a network allowlist?
7. Add a `4hacks` channel enum value (Plumo migration + `ALTER TYPE`), or use `api`?
8. Double-submit guard on the 4hacks side (Plumo has no `sourceRef` idempotency).

## 7. Recommended path + build order
**Ship Option A first, upgrade to B later** — one-way delivers working intake with minimal surface; the deploy (the true bottleneck) is shared. Gate with `SessionAuthGuard`.

1. **Deploy Plumo** (§4) — host + PG16(citext/pgcrypto/db:extras) + Redis + S3 + SMTP; run API **and** worker; seed admin/team/agent; confirm public `PLUMO_API_URL`. *(critical path)*
2. **Mint the key** — admin login → `POST /api/v1/api-keys {scopes:['tickets:write','tickets:read']}`; capture the one-time secret.
3. **4hacks backend (dev)** — `support` module + `PlumoService` + DTO + controller (`SessionAuthGuard`); register; add env; deploy backend.
4. **Test create** — POST → 201 `{id,number}`; verify in the Plumo console (first message `authorType:'customer'`).
5. **4hacks frontend (master)** — `supportApi.createTicket` + real `onSubmit` + error state; deploy. **→ Option A live.**
6–9. *(Option B)* `SupportTicket` model + migration → webhook receiver (raw-body HMAC + dedupe, `GET /tickets/:id` for reply body) → Plumo admin registers webhook (store `PLUMO_WEBHOOK_SECRET`) → in-app status view + SMTP-suppression decision. **→ Option B live.**
