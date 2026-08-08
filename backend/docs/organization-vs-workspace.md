# Organization vs Workspace: is there damage, and do we migrate now?

Written 2026-08-08. Every claim below cites `file:line`. Paths are relative to the repo root.

> **Status update, same day: recommendation (a) has been carried out.** `Organization`
> is now `Company` — model, table (`organizations` → `companies`), both FK columns
> (`organization_id` → `company_id`), the module (`src/companies/`), the route path
> (`/companies`) and the frontend client. The migration is
> `prisma/migrations/20260808120000_rename_organizations_to_companies`; it is
> catalog-only and carries assertions for the RLS policy, the renamed indexes and
> constraints, and the PG15 column-list `SET NULL` on both composite FKs. **It has been
> reviewed but not yet executed against a database.**
>
> The two unguarded write routes noted in §3.1 below are also fixed — both are now
> `@Roles('admin')`. See `docs/rbac-audit.md` (amended 2026-08-08) for that half.
>
> **Everything below is the pre-rename analysis and is left as written**, because it is
> the reasoning of record for why the rename was worth doing and why the tenancy model
> did *not* need changing. Read `Organization` as `Company` and `organizations` as
> `companies` throughout; the `file:line` citations point at the pre-rename tree.

---

## VERDICT

**No, there is no architectural damage, and no data migration is needed to fix
`Organization`. Your mental model is right about the product and wrong about one word.**
`Workspace` is the tenant — one per organisation, exactly as you describe — and it is the
*only* tenant; `Organization` is a completely different, much smaller thing: the
**customer's company**, the Zendesk/Intercom concept, a child row that lives *inside* a
workspace and cannot exist without one. The two are not conflated anywhere in the code —
I looked at every read and every write of `prisma.organization` and none of them touches
PM, tenancy, or authorisation. So the answer to "should we operate on Organization right
now" is **no**. **But the investigation turned up something that does need operating on
today, and it is not the thing you asked about: your belief that a CS workspace can only
come into existence by being imported from PM is false in the code — the production desk
`dar-blockchain` was created by a migration, not by PM, and because of that the next time
you click "Continue with Plumo" the system will very likely create a *second, empty*
Dar Blockchain desk and sign you into it.** That is section 3. Read it first if you read
nothing else.

---

## 1. What each table actually is, in your vocabulary

### `Workspace` = your desk = your organisation = the tenant

This is the thing you mean when you say "workspace". One per organisation. Everything you
own lives under it. `backend/prisma/schema.prisma:530-549`.

- It carries the PM link: `pmWorkspaceId` at `schema.prisma:539`.
- **18 tables hang off it.** Each carries `workspaceId String @default(dbgenerated("app_current_workspace()"))`:
  `organizations:111`, `customers:125`, `teams:187`, `business_hours:202`, `sla_policies:216`,
  `tickets:233`, `ticket_messages:296`, `attachments:322`, `tags:338`, `canned_responses:350`,
  `api_keys:366`, `export_state:404`, `webhooks:416`, `webhook_deliveries:430`,
  `notifications:472`, `audit_log:488`, `chat_sessions:512`, `invitations:596`.
- The database enforces the boundary itself, not the application:
  `backend/prisma/migrations/20260806140000_row_level_security/migration.sql:47-82` puts one
  `workspace_isolation` policy on every one of those tables.

### `Organization` = a company that writes to your support desk

`schema.prisma:109-121`. Four real fields: `name`, `domain`, `externalRef`, and a
`workspaceId`. It groups **customers** and **tickets**.

**Concretely, in your business:**

> Your desk is **Dar Blockchain**. That is a `Workspace`. Slug `dar-blockchain`, created at
> `backend/prisma/migrations/20260802000000_workspace_tenancy/migration.sql:344`.
>
> Suppose a company called **Northwind Health** buys from you, and three of their people —
> ines@northwindhealth.com, ali@…, sam@… — email your support address. Those three people
> are three `Customer` rows. **Northwind Health is one `Organization` row.** It exists so
> that an agent looking at Ines's ticket can see "this is Northwind, they have 14 open
> tickets and an enterprise SLA" instead of seeing three unrelated strangers.
>
> Northwind Health does **not** have a Plumo PM account. Northwind Health does **not** log
> in. Northwind Health has no bots, no agents, no settings, no RLS scope. It is a label on
> your customers. If Northwind churns, you delete one row and nothing about your desk changes.

The name is a genuine collision with PM's vocabulary and it is why you and the code
disagree — but they are not the same object and never were. **The schema already says so
in English, twice**, because whoever wrote it anticipated exactly this confusion:

- `schema.prisma:528-529` — the doc comment directly above `model Workspace`:
  "A tenant: one support desk. Distinct from `Organization`, which is a CUSTOMER's company.
  Both concepts are real and they are not the same thing."
- `20260802000000_workspace_tenancy/migration.sql:182-186, 253-254` — the same statement
  compiled into the database as a `COMMENT ON TABLE`.

**The one-line test:** if the row can sign in, it is a `Workspace`. If the row can only be
emailed, it is an `Organization`.

### Which is which, at a glance

| | `Workspace` | `Organization` |
|---|---|---|
| Your word for it | your desk / your org | a customer's company |
| Example | Dar Blockchain | Northwind Health |
| Comes from PM? | yes (`pmWorkspaceId`, `schema.prisma:539`) | never — zero PM references anywhere |
| Can log in? | yes | no |
| Has RLS scope? | it *is* the scope | it is *subject to* the scope (`schema.prisma:111`) |
| Owns bots/API keys? | yes (`schema.prisma:364-395`) | no — `ApiKey` has no `organizationId` at all |
| Rows in production | 2 (`dar-blockchain`, `firas2workspace`) | ~0 (see §4) |

---

## 2. Is there real damage?

**No.** Not one conflation. I checked every place the word could leak.

**Every write of `prisma.organization` in the entire backend — three, and none is PM:**

| Location | What it does |
|---|---|
| `backend/src/organizations/organizations.module.ts:44` | `create`, from `POST /organizations` |
| `backend/src/organizations/organizations.module.ts:50` | `update`, from `PATCH /organizations/:id` |
| `backend/prisma/seed.ts:75` | 4 demo companies (Northwind Health, HashCare, Vela Studio, Bramble Coffee) |

PM sign-in never touches it. `AuthService.provisionDesk` / `createDesk`
(`backend/src/auth/auth.service.ts:278-388`) creates a `Workspace`, a `Team`, and SLA
policies — and no organization. `backend/src/pm-identity/pm-identity.module.ts` contains
zero references to `organization`. `Organization.externalRef` (`schema.prisma:114`), the
field that *would* hold an import id, is populated by nothing — not even the seed. **There
is no import path into this table from PM or anywhere else.**

**Organization is structurally incapable of being a second tenant.** Five independent
mechanisms, any one of which would be enough:

1. `workspace_id NOT NULL` with a workspace default — `schema.prisma:111`,
   `20260802000000:474`.
2. Composite unique `(workspace_id, id)` — `20260802000000:562`.
3. The FKs from `customers` and `tickets` are **composite** — `20260802000000:593-596` and
   `:608-611` — so a customer in workspace A referencing an org in workspace B is not
   merely forbidden, it is **unrepresentable**.
4. An immutability trigger stops `workspace_id` being edited — `20260802000000:531-542`.
5. An RLS `workspace_isolation` policy, applied automatically because the table has a
   `workspace_id` column — `20260806140000:47-82`.

A table that is FK-restricted to `workspaces` and row-filtered by
`app_current_workspace()` is a leaf, not a rival.

**No query anywhere filters by `organizationId` for access control.**
`backend/src/common/guards/team-scope.service.ts` has no reference to it, and
`backend/src/common/permissions.ts` has no `organizations` key.

### The collision is real, but it lives entirely in English

The PM sign-in path says "organisation" when it means *workspace* — including in a string
you can actually see in the browser:

- `backend/src/auth/auth.service.ts:295` — `'Could not create a workspace for your organisation. Please try again.'`
- `backend/src/auth/auth.service.ts:328` — same string.
- Comments meaning *workspace*: `auth.service.ts:31, 187, 211, 270, 273, 320, 360`;
  `pm-identity.module.ts:72`.

None of those lines touch `prisma.organization`. That is precisely why your mental model
and the code diverged: every sentence you have read about PM sign-in says "organisation",
and there happens to be a table by that name doing something else entirely.

**A naming collision that confuses humans is a real cost. It is not corruption, and it
does not need a data migration.**

### Four genuine defects found on the way — none of them a schema problem

1. **Two unguarded write routes.** `organizations.module.ts:71` (`@Post()`) and `:76`
   (`@Patch(':id')`) carry no `@Roles`/`@Scopes` under the global `RolesGuard`. Any agent
   can `PATCH /organizations/<id> {"domain":"acme.com"}` and silently re-parent which
   company inbound customers get filed under. Every sibling resource (tags, teams, SLA) is
   `@Roles('admin')`. Already written up at `backend/docs/rbac-audit.md:217-222, 315`.
2. **`Ticket.organizationId` is write-only.** Written at
   `backend/src/tickets/tickets.service.ts:139` and `backend/src/email/email.service.ts:283`;
   **read by nothing** — not `src/reports/`, not the frontend, which always joins through
   `t.customer.organization` (`frontend/lib/api/adapter.js:401, 419, 483`). It also drifts:
   change a customer's company and their old tickets keep the stale id.
3. **Nondeterministic domain match.** `organizations.domain` has no unique constraint
   (`schema.prisma:113`), and `findFirst({ where: { domain } })` at
   `backend/src/customers/customers.module.ts:158` and `:218` has no `orderBy` — two
   same-domain orgs in one workspace resolve arbitrarily.
4. **Fix the prose.** `auth.service.ts:295` and `:328` are the only *user-visible* place the
   two words collide. Say "workspace" there.

---

## 3. Does the import-only rule hold? **NO — AND THIS IS THE FINDING THAT MATTERS**

You said: "To use Plumo CS you must have an account and a workspace in Plumo PM."

**The code does not enforce that, and your own production desk is the counterexample.**

### Every way a `Workspace` can come into existence

| # | Path | PM link? |
|---|---|---|
| a | `loginWithPm` → `provisionDesk` → `createDesk` — `backend/src/auth/auth.service.ts:278-388`, insert at `:313-318` | **yes** — the only runtime path |
| b | Tenancy-migration bootstrap: `INSERT INTO workspaces (slug, name) VALUES ('dar-blockchain', 'Dar Blockchain')` — `20260802000000_workspace_tenancy/migration.sql:344` | **NO — this is your production desk** |
| c | Dev seed, `slug: 'plumo'` — `backend/prisma/seed.ts:29-33` | no |
| d | Integration test harness — `backend/test/integration/harness.ts:103` | no |
| e | An admin "create workspace" endpoint | **does not exist** |

There is no `workspaces` controller anywhere in `backend/src`. `users.isPlatformAdmin` was
added by the tenancy migration as "Platform authority: who may create a workspace at all"
(`20260802000000:369`, `schema.prisma:164`) and is **read by nothing in the entire
backend** — the only occurrence in the repo is the schema line that declares it. It is a
dead column reserving a path that was never built.

And the schema deliberately permits PM-less desks: `pmWorkspaceId` is nullable
(`schema.prisma:539`) and its uniqueness is a **partial** index
`WHERE pm_workspace_id IS NOT NULL` (`20260802000000:247-248`).

### Why this is live and dangerous right now

`loginWithPm` finds your desk with this query — `auth.service.ts:172-176`:

```ts
const linked = await this.prisma.workspace.findMany({
  where: { pmWorkspaceId: { in: administered.map((w) => w.id) } },
  ...
});
```

**A `NULL` never matches an `IN` list.** So a desk whose `pm_workspace_id` is NULL is
invisible to "Continue with Plumo". Password login still works
(`auth.service.ts:134`), which is why nobody has noticed.

**It is worse than a refusal.** With `linked` empty, `desks` is empty too, so control falls
straight through to the auto-provision branch at `auth.service.ts:202-217` — and
auto-provision defaults **ON**: `backend/src/config/configuration.ts:58` reads
`process.env.PM_AUTO_PROVISION_DESKS !== 'false'`. So instead of refusing, PM sign-in
**creates a brand-new empty desk for an organisation that already has one**. The slug
candidates (`auth.service.ts:81-91`) collide on `dar-blockchain` and land you on
`dar-blockchain-2` or `desk-<idtail>`, with none of your tickets, agents, SLAs or bots —
while the real desk sits there untouched. That is your "one workspace per organisation"
invariant breaking, and it is caused directly by the NULL.

**Is `dar-blockchain` actually NULL?** Almost certainly yes.
`20260807010000_pm_identity_link/migration.sql:10` states the column "is NULL everywhere
today (nothing has ever written to it)". `firas2workspace` was auto-provisioned *by* PM
sign-in (`backend/docs/auth-feature-inventory.md:73-75`) so it has one. `dar-blockchain`
can only be filled retroactively by `PmLinkService.apply`
(`backend/src/pm-identity/pm-identity.module.ts:60-101`) via `GET /auth/pm/start`, and
`backend/docs/manual-test-script.md:158-176` records that scenario as **never run**.

**Check it right now:**

```sql
SELECT slug, name, pm_workspace_id, status FROM workspaces ORDER BY created_at;
```

Two further traps in the retro-link path, relevant if you use it to fix the data:

- It matches PM workspace → CS desk **by slug equality only** (`pm-identity.module.ts:74-76`).
  A slug mismatch means the link silently does nothing — no error, and the callback still
  reports `pmLink=ok`.
- The audit write at `pm-identity.module.ts:93` runs **outside** the transaction closed at
  `:91`, on a `@Public` callback with no bound workspace. `audit_log.workspace_id` is
  `NOT NULL DEFAULT app_current_workspace()` (`schema.prisma:488`), so it raises 23502 and
  the operator is told the link **failed even when the mapping committed** (already
  documented at `manual-test-script.md:169-176`).

### One more tenancy hole, unrelated to Organization

> **[08-08] CLOSED, and not the way this section proposed.** The column is now
> **`pm_oauth_states.link_workspace_id`** (`20260808130000_pm_oauth_state_link_workspace_id`).
> It never held a tenant — it holds a hint carried across the OAuth redirect, naming the desk
> to map if the flow comes back as a *link*, and NULL when it is a *sign-in*. So it gets no
> policy, no immutability trigger and no `app_current_workspace()` default, because all three
> would refuse every PM sign-in: the callback is `@Public()` and runs with no workspace bound,
> where `workspace_id = app_current_workspace()` is NULL rather than true. Renaming it is what
> made the invariant true again with nothing exempted — see the reasoning below on Priority 2.
> The schema-wide assertion this section asked for ships in that migration.

`pm_oauth_states` **had a `workspace_id` column with a real FK to `workspaces`** —
`20260807020000_pm_oauth_client/migration.sql:58`, `schema.prisma:669` — but it was created
*after* the RLS migration, so the self-deriving loop never saw it. It had **no
`workspace_isolation` policy, no immutability trigger, and no `app_current_workspace()`
default.**

The same migration's own comment at `:70-71` asserts "They carry no workspace_id" —
which is wrong about the table declared twelve lines above it. And the RLS migration's
comment at `20260806140000:50-52` promises "a table added later without a policy is
impossible to miss" — which is false, because the loop runs once at migration time, not
continuously. Contrast `invitations`, which correctly ships its own policy, trigger, and a
self-assertion (`20260807190000_invitations/migration.sql:166, 181-185, 257-263`).

Blast radius is small (rows are keyed by an unguessable single-use `state`), but the
invariant has quietly become "self-deriving *only for tables that existed on 2026-08-06*",
and that is a trap for the next table.

---

## 4. Recommendation

### On `Organization`: **(a) rename it to `Company` — but schedule it, do not do it today.**

Not (b): do **not** delete it. It is currently near-dead in production — the only writer is
the seed (`seed.ts:75`), there is no console screen for it (no `Organizations.jsx` exists),
and the frontend's API client for it at `frontend/lib/api/endpoints.js:69-73` is imported
by **no file in the frontend**. But you sell B2B. "Show me every open ticket from Northwind"
is table stakes, and deleting this means rebuilding it in three months.

Not (c): the confusion is not hypothetical. It cost you this review, and it nearly cost you
a migration you did not need. The collision is with your own IdP's vocabulary, so it is
permanent — PM will always call tenants "organizations". The code has already had to plant
three defensive comments to hold the line (`schema.prisma:528-529`,
`20260802000000:182-186`, `:253-254`); a name that needs to be defended in prose in three
places is a name that is fighting its readers.

**Rename it, because this is the cheapest the rename will ever be:** no UI to update, a
dead frontend client, no external API consumers, and essentially no production rows. Every
month you wait, that changes.

### What the migration must do

**Verify the row count first.** If this returns anything but small numbers, stop and
re-plan the data step:

```sql
SELECT w.slug, count(o.*) FROM workspaces w
LEFT JOIN organizations o ON o.workspace_id = w.id GROUP BY w.slug;
```

**Database** (one new migration; do **not** edit the applied migrations — `organizations`
stays in their text, and the new migration renames it on replay):

```sql
ALTER TABLE organizations RENAME TO companies;
ALTER TABLE customers RENAME COLUMN organization_id TO company_id;
ALTER TABLE tickets   RENAME COLUMN organization_id TO company_id;
```

Then, for tidiness only, rename the dependent objects — the composite unique from
`20260802000000:562`, the composite FKs from `:593-596` and `:608-611`, the indexes at
`:1059` and `:1098`, and the immutability trigger from `:531-542`. Finish with
`COMMENT ON TABLE companies IS 'A CUSTOMER''s company. NOT a tenant — the tenant is workspaces.'`.

Three things you do **not** have to do, and should verify rather than assume:
- **The RLS policy follows the rename automatically.** Policies attach to the table's OID,
  not its name. Confirm with `SELECT polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname='companies';`
- **The `NOT NULL` and the `DEFAULT app_current_workspace()` survive** a column rename.
- **No data moves.** `ALTER TABLE … RENAME` is a catalog-only change: instant, no table
  rewrite, regardless of row count.

**Prisma:** `model Organization` → `model Company` with `@@map("companies")`; `Customer.organizationId`
→ `companyId @map("company_id")`; same on `Ticket`; the back-relations `customers[]`/`tickets[]`
are unchanged.

**Backend** (small — every site is listed in §2):
`src/organizations/` → `src/companies/`, route `/organizations` → `/companies`,
`prisma.organization` → `prisma.company` at `organizations.module.ts:28, 35, 44, 50` and
`customers.module.ts:158, 218`, the include at `tickets.service.ts:58`, the select at
`search.module.ts:64`, the DTO fields at `customers.module.ts:12, 33`, and the writes at
`tickets.service.ts:139` / `email.service.ts:283`. **Leave the historical
`entityType: 'organization'` strings in `audit_log` alone** — those are a record of what
happened, and rewriting history to match a new vocabulary is how audit logs stop being
evidence. Write `'company'` going forward.

**Frontend** (eleven lines, all in one file): `frontend/lib/api/adapter.js:315, 320, 321, 401, 419, 479, 483, 521, 602, 607, 632`
read `customer.organization.{id,name}` — they follow the API response shape, so they change
with it. Delete or rename the dead client at `endpoints.js:69-73`. Change the
`Customers.jsx` column header to "Company".

**Downtime.** The SQL is instantaneous, but the currently-deployed backend queries
`organizations` and would 500 the moment the rename lands. Two options:

- **Simplest, and right for you:** a coordinated deploy — migrate and restart the API in the
  same window. On a single live desk with your traffic this is seconds of 502, at a time you
  choose. Take a backup first (`ops:` commit `3fe30af` added one).
- **Zero-downtime, if you ever want it:** expand/contract — after the rename, add
  `CREATE VIEW organizations AS SELECT *, company_id … FROM companies` plus
  generated/updatable columns so the old code keeps working, deploy, then drop the view.
  Genuinely not worth the complexity here.

### But the order of operations is not negotiable

The rename is a **quality-of-life** change. Two things ahead of it are **correctness**
changes, and one of them is armed right now:

**Priority 1 — today, before the next PM sign-in.** Stop the duplicate-desk scenario in §3.
Do **both**:
- Set `PM_AUTO_PROVISION_DESKS=false` (`configuration.ts:58`) — this is a config flip, no
  deploy, and `backend/docs/auth-readiness-plan.md:166` already recommends it. With it off,
  an unlinked desk gets a clear refusal (`auth.service.ts:204-206`) instead of a silent clone.
- Then set `dar-blockchain`'s `pm_workspace_id` to the real PM workspace id, so "Continue
  with Plumo" actually reaches your desk. Confirm the slugs match on both sides first — the
  linker matches on slug alone (`pm-identity.module.ts:74-76`) and fails silently otherwise.

~~**Priority 2 — this week.** A small migration for `pm_oauth_states`: give it the
`workspace_isolation` policy, the immutability trigger, and the
`DEFAULT app_current_workspace()`; or drop the `workspace_id` column if the desk can be
recovered from the state row another way.~~ Add a schema-wide assertion, modelled on
`20260807190000:257-263`, that raises if **any** table in `public` has a `workspace_id`
without a policy — so the next post-RLS table cannot escape silently. ~~Fix the wrong comment
at `20260807020000:70-71` while you are there.~~

**[08-08] Done — `20260808130000_pm_oauth_state_link_workspace_id`, and both struck-through
options were wrong.** The policy would have refused every PM sign-in: rows are written before
anyone is signed in and read back by an `@Public()` callback on an unbound connection, where
`workspace_id = app_current_workspace()` evaluates to NULL rather than true. The immutability
trigger and the `DEFAULT` fail for the same reason. And dropping the column loses a live
value — `pm-identity.service.ts` writes it at the start of a link and
`pm-identity.module.ts` reads it back to decide which desk to map.

The third option is the one that was taken: **rename it to `link_workspace_id`.** The column
was never a tenant key, it was a hint carried through a redirect, and the name was the only
thing claiming otherwise. With it renamed, "has a `workspace_id` column" means exactly "is
tenant data", the `RLS_EXEMPT_TABLES` list in `db-roles.integration.spec.ts` is **deleted**
rather than emptied, and the assertion is the bare `expect(unprotected).toEqual([])`. The
schema-wide assertion asked for above is assertion (4) of that migration; two new assertions
in the spec keep the *reason* RLS stays off executable, so it cannot be undone by a migration
that looks like tightening.

The wrong comment at `20260807020000:70-71` is **deliberately left alone**. Editing an
applied migration changes its checksum and rewrites history that was true when it ran; the
correction belongs in the file that changes the fact, and it is in the header of
`20260808130000`.

**Priority 3 — when you have a quiet afternoon.** The `Organization` → `Company` rename
above, plus the four small defects from §2 (lock down the two write routes, decide whether
`Ticket.organizationId` is used or dropped, add an `orderBy` or a unique constraint to the
domain match, and change "organisation" to "workspace" in the two user-facing strings).

---

## 5. What NOT to do

**Do not merge `Organization` into `Workspace`.** This is the tempting move if you believe
they are the same thing, and it would be the worst outcome of this entire review. It would
promote Northwind Health — a company that has never heard of Plumo — into a tenant with its
own RLS scope. You would need a `Workspace` row per customer company, `Customer` and
`Ticket` would point at a workspace that is not the one owning them, and the composite FKs
at `20260802000000:593-596, 608-611` would have to be dropped — which is to say you would
tear out the exact constraints that currently make cross-tenant leakage unrepresentable.
It is not a refactor; it is deleting your isolation model. **Never do this.**

**Do not make PM the source of `Organization` rows.** Wiring `externalRef` or the domain
match to PM would import your *own* org as a customer-company of itself. PM knows about
tenants. It knows nothing about the companies that email you.

**Do not "fix" the NULL `pm_workspace_id` by making the column `NOT NULL`.** The partial
unique index at `20260802000000:247-248` exists precisely so PM-less desks are legal, and
the seed (`seed.ts:29-33`) and the test harness (`test/integration/harness.ts:103`) both
depend on that. Fix the *row*, not the constraint.

**Do not sign in with "Continue with Plumo" before Priority 1 is done.** That single click
is the thing that creates the duplicate desk. Use password login until the flag is off.

**Do not fix the vocabulary by renaming `Workspace`.** It is the correct word, it matches
PM's own `X-Workspace-Slug` contract (`backend/src/common/workspace/workspace-context.service.ts:15, 77-81`),
and it is load-bearing in 18 tables, every RLS policy, and the JWT. `Organization` is the
one that moves.

**Do not bundle the rename with the Priority 1 and 2 fixes.** If something breaks in a
combined deploy you will not know whether it was the safety fix or the cosmetics. Ship them
separately, in that order.

**Do not edit the applied migrations.** `20260802000000` and `20260806140000` have run on
production. Renaming things inside their text changes nothing on your live database and
guarantees a divergent rebuild later.
