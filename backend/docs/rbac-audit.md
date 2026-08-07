# RBAC: is it implemented?

**Audit date:** 2026-08-07 · **Scope:** `backend/src`, `frontend/components` · **Method:** read the code, cite `file:line`, distinguish *enforced* from *looks enforced*.

---

## VERDICT

**Yes — RBAC is implemented, it is real, and it runs on every request.** The guard is registered globally, the role hierarchy works, and the rules the product actually depends on are enforced; what is missing is not the mechanism but four specific gaps — two write routes with no gate at all, no last-admin protection, four API-key branches that skip checks a human would hit, and no test that any of it is wired to the right routes.

The honest one-line summary: **the enforcement is sound, the coverage has holes, and the proof is thin.** Nothing here is a "rewrite RBAC" finding. Items 1–3 in [HOLES](#3-holes) are each under 20 lines to fix.

One correction to the brief this audit was commissioned against: **`PERMISSIONS` is dead, but `permissions.ts` is not.** The `PERMISSIONS` map is read by nothing but its own spec — that part is confirmed. But `roleAtLeast` and `ROLE_ORDER` in the same file are the actual hierarchy, imported by `roles.guard.ts:4`, and `API_SCOPES` is imported by `api-keys.module.ts:8` to validate the scope DTO. Deleting the file would break the guard. Delete the *map*, keep the rest.

---

## 1. WHAT IS ENFORCED — the real model

A principal is resolved per request, not per session. `AuthGuard` re-reads the **`WorkspaceMembership`** row on every call, so `role` and `teamId` are properties of *(human, desk)*, never of the human — one person is genuinely admin of one desk and agent of another, and a role change takes effect on the next request rather than the next login. Three guards run globally in order (`app.module.ts:100-102`): `PrincipalThrottlerGuard` → `AuthGuard` → `RolesGuard`, with `WorkspaceBindingInterceptor` at `:105`. **No controller registers its own guard and none needs to** — every `@Roles()` in the codebase is genuinely live. That is the single most important fact in this document, because everything below assumes decorator placement *is* the policy.

Enforcement is two layers, and only the first is visible to a route audit:

1. **`@Roles()` + `RolesGuard`** — a coarse floor. 42 route-level decorators (34 admin, 7 lead, 1 agent) over 58 mutating routes.
2. **`TeamScopeService`** (`common/guards/team-scope.service.ts`) — a *row* filter, called explicitly by services. Not a guard, not global. This is where most of the interesting policy lives.

Roles are **hierarchical, not exact-match**: `roleAtLeast` is `ROLE_ORDER[role] >= ROLE_ORDER[min]` over `{agent:0, lead:1, admin:2}` (`permissions.ts:90-95`), so admin satisfies `@Roles('lead')`. RLS isolates *tenants* and is orthogonal to all of this — it never implements a role.

### What a lead can do that an agent cannot

As the **code** has it, not the matrix:

| capability | where it is actually enforced |
|---|---|
| Reopen a resolved/closed ticket | `tickets.service.ts:643` — agents throw, everyone else passes |
| Assign work to **other people** in their team | `tickets.service.ts:658-704` (`assertCanAssign`) — an agent may only assign *to themselves*, and only from their own team's pool |
| Move a ticket **into** their own team | `tickets.service.ts:582-589` — agents blocked outright; a lead may only move *into* their own team |
| Bulk actions | `tickets.controller.ts:73` **and** `tickets.service.ts:709-711` (stated twice, both agree) |
| Merge tickets | `tickets.controller.ts:79` **and** `tickets.service.ts:749-751` |
| Manage their team's canned responses | `canned-responses.module.ts:79,85,91` + `assertManage` `:37-42` |
| Add/remove **agents** in their own team | `teams.module.ts:154,160` + `:98-104` |
| See the whole team's tickets, not just assigned ones | `team-scope.service.ts:89-94` — lead filter is `{teamId}`; agent is `OR:[{teamId},{assigneeId}]` |
| See the settings nav in the console | `Console.jsx:1739` `canAdmin: S.role !== 'agent'` |

### What an admin can do that a lead cannot

Everything with `@Roles('admin')` — 34 routes, essentially the whole configuration surface: users, teams, tags, SLA policies, business hours, webhooks, API keys, invitations, the audit log, inbound email config, PM linking, ticket deletion, customer anonymisation. Plus three things that are *not* decorator-visible:

- **Unrestricted row scope.** `visibilityWhere` returns `{}` for admin (`team-scope.service.ts:87`) — every ticket regardless of team.
- **Unrouted tickets.** A ticket with `teamId = null` matches no lead's filter. Admins see them; **leads do not** (see the doc-comment bug in [HOLES §6](#6-the-teamscopeservice-doc-comment-is-false-and-the-realtime-layer-believes-it)).
- **Global canned responses** — `assertManage` reserves `teamId: null` responses for admins (`canned-responses.module.ts:37-42`).

### Where this design is genuinely good — worth saying

This is not a codebase that forgot about authorization. Several things here are better than typical:

- **`loadAndAssert` (`team-scope.service.ts:32-36`) fuses "fetch" with "may you".** Its docstring records that `remove()` once made only the first call and any admin could delete any ticket by id. Fusing them made the omission *unrepresentable*. That is the right structural fix, and it is why the ticket surface has no scope holes today.
- **`loadTicketUnchecked` (`:46`) is deliberately ugly-named** so it cannot be reached for absent-mindedly. Two callers, both legitimate.
- **The `NO_TEAM` sentinel (`:17`) is a real bug prevented.** A bare `{teamId: undefined}` is stripped by Prisma and degrades to *match everything* — a team-less lead would have seen the entire instance. Matching an impossible UUID fails closed instead. This is exactly the kind of thing that ships broken everywhere else.
- **`UsersService.update` splits the DTO across two tables explicitly** (`users.module.ts:136-152`) rather than spreading it, with a comment saying why: so a future field can't be sent to whichever table happens to accept it.
- **`assertCanAssign` handles the API-key case properly** (`tickets.service.ts:659-677`) and explains the reasoning — handing a ticket to someone outside the key's team would surface it in that person's inbox, a leak the key's *read* scope would never permit. This is the model the other two key branches should have copied.
- **`main.ts:67-73` sets `whitelist: true, forbidNonWhitelisted: true`**, so privilege-escalation-by-extra-field is a 400, not a silent write. `PATCH /users/me` cannot smuggle a `role`.
- **Roles on membership rather than on `User`** is the correct call for a multi-desk product and was clearly deliberate.

---

## 2. THE ENDPOINT MATRIX

Every route, its gate, and a flag on anything unguarded. **`—` in the gate column means no `@Roles` and no `@Scopes`.** `⚠` marks a genuine gap; `✓svc` means the real check is in the service, deliberately.

Legend for **who**: after guard *and* service checks, who can actually succeed.

### tickets — `src/tickets/tickets.controller.ts`
| method + path | line | gate | who can actually call it |
|---|---|---|---|
| POST /tickets | 17 | `tickets:write` | agent+ ✓svc `service.ts:214-229` confines agent/lead to own team; key confined |
| GET /tickets | 24 | `tickets:read` | agent+ ✓svc `visibilityWhere` `:310` |
| GET /tickets/counts | 32 | `tickets:read` | agent+ ✓svc `:452` |
| GET /tickets/:id | 39 | `tickets:read` | agent+ in scope ✓svc `loadAndAssert` `:264` |
| PATCH /tickets/:id | 46 | `tickets:write` | agent+ in scope ✓svc; team-move needs lead `:583-588` ⚠ key bypasses |
| POST /tickets/:id/assign | 53 | — (human-only) | ✓svc `:675-701`: agent=self only, lead=own team, admin=all |
| POST /tickets/:id/status | 58 | `tickets:write` | agent+ in scope; **reopen needs lead** `:643` ⚠ key bypasses |
| POST /tickets/:id/messages | 65 | `tickets:write` | agent+ in scope ✓svc `messages.service.ts:26` |
| POST /tickets/bulk | 72 | **lead** | lead+ (also `service.ts:709`) |
| POST /tickets/:id/merge | 78 | **lead** | lead+ (also `service.ts:749`) |
| GET /tickets/:id/audit | 84 | — (human-only) | agent+ in scope ✓svc `:812` |
| DELETE /tickets/:id | 89 | **admin** | admin |
| POST /tickets/:id/bot-enabled | 102 | `agent` ⚠ | agent+ — **decorator is a no-op**, `agent` is the floor |

### users — `src/users/users.module.ts`
| GET /users | 211 | — | any human; returns `email` for every member |
| PATCH /users/me | 217 | — | self only ✓svc, DTO has no `role` |
| GET /users/:id | 222 | — | any human, workspace-scoped `:99-109` |
| POST /users | 227 | **admin** | admin |
| PATCH /users/:id | 233 | **admin** | admin ⚠ no self-guard, no last-admin guard, writes global `isActive` |
| DELETE /users/:id | 239 | **admin** | admin ⚠ no self-guard, no last-admin guard |

### organizations — `src/organizations/organizations.module.ts`
| GET /organizations | 61 | — | any human |
| GET /organizations/:id | 66 | — ⚠ | any human — returns every customer `name` + `email` `:37` |
| **POST /organizations** | **71** | **— NONE** ⚠⚠ | **any agent** — no guard, no service check `:43-47` |
| **PATCH /organizations/:id** | **76** | **— NONE** ⚠⚠ | **any agent** — incl. `domain`, the customer-matching field `:49-53` |

### teams — `src/teams/teams.module.ts`
| GET /teams | 125 | — | any human |
| GET /teams/:id | 130 | — | any human |
| POST /teams | 135 | **admin** | admin |
| PATCH /teams/:id | 141 | **admin** | admin (bare `where:{id}`, relies on RLS `:68-72`) |
| DELETE /teams/:id | 147 | **admin** | admin (checks workspace via `get()` `:75`) |
| POST /teams/:id/members | 153 | **lead** | lead in own team, **agents only** ✓svc `:98-104`; admin anywhere |
| DELETE /teams/:id/members/:userId | 159 | **lead** | same |

### customers — `src/customers/customers.module.ts`
| GET /customers | 256 | `customers:read` | any human ⚠ **no principal, no team filter** |
| GET /customers/:id | 263 | `customers:read` | any human ⚠ same |
| POST /customers | 270 | `customers:write` | any human (matches `customers.edit:'any'`) |
| PATCH /customers/:id | 277 | `customers:write` | any human ⚠ no team filter |
| DELETE /customers/:id | 284 | **admin** | admin (anonymise, not hard delete) |

### tags · sla · business-hours
| GET /tags | `tags:55` | — | any human |
| POST /tags | `tags:60` | **admin** | admin |
| PATCH /tags/:id | `tags:66` | **admin** | admin |
| DELETE /tags/:id | `tags:72` | **admin** | admin |
| GET /sla-policies | `sla:44` | — | any human |
| GET /sla-policies/:id | `sla:49` | — | any human |
| POST /sla-policies | `sla:54` | **admin** | admin |
| PATCH /sla-policies/:id | `sla:60` | **admin** | admin |
| DELETE /sla-policies/:id | `sla:66` | **admin** | admin |
| GET /business-hours | `sla:73` | — | any human |
| POST /business-hours | `sla:78` | **admin** | admin |
| PATCH /business-hours/:id | `sla:84` | **admin** | admin |

### canned-responses — `src/canned-responses/canned-responses.module.ts`
| GET /canned-responses | 73 | — | any human — sees **all** teams' + globals (no principal) |
| POST /canned-responses | 78 | **lead** | lead in own team; globals admin-only ✓svc `:37-42` |
| PATCH /canned-responses/:id | 84 | **lead** | same |
| DELETE /canned-responses/:id | 90 | **lead** | same |

### webhooks · api-keys · audit
| GET /webhooks | `webhooks:109` | **admin** | admin |
| POST /webhooks | `webhooks:115` | **admin** | admin |
| PATCH /webhooks/:id | `webhooks:121` | **admin** | admin |
| DELETE /webhooks/:id | `webhooks:127` | **admin** | admin |
| GET /webhooks/:id/deliveries | `webhooks:133` | **admin** | admin |
| GET /api-keys | `api-keys:96` | **admin** | admin — select omits `keyHash` `:33-41`, no secret leak |
| POST /api-keys | `api-keys:102` | **admin** | admin ⚠ cannot set `expiresAt` (DTO `:10-23`) |
| DELETE /api-keys/:id | `api-keys:108` | **admin** | admin |
| GET /audit | `audit:12` | **admin** | admin — **no console caller** |

### invitations — `src/invitations/invitations.controller.ts`
| POST /invitations | 29 | **admin** | admin — may invite at `role:'admin'` (`dto:12-13`) |
| GET /invitations | 35 | **admin** | admin |
| DELETE /invitations/:id | 41 | **admin** | admin |
| GET /invitations/token/:token | 60 | `@Public` | anyone with the token |
| POST /invitations/token/:token/accept | 68 | `@Public` | anyone with the token |

### reports · integrations · search
| GET /reports/summary | `reports:219` | `reports:read` | ✓svc `teamScope:45-60` — agent=own assigned, lead=own team, admin=all |
| GET /reports/volume | `reports:226` | `reports:read` | ✓svc same |
| GET /reports/by-channel | `reports:233` | `reports:read` | ✓svc same |
| GET /reports/by-agent | `reports:240` | `reports:read` | ✓svc `:139-164` — agent sees own row only |
| GET /integrations/metrics | `integrations:55` | `reports:read` + **admin** | admin human ⚠ **or any `reports:read` key — no team filter at all** `:19-41` |
| POST /integrations/export/run | `integrations:63` | `exports:run` + **admin** | admin human; any `exports:run` key |
| GET /search | `search:80` | — | any human; tickets scoped `:36`, **customers not** `:57-66` |

### attachments · notifications · chat
| POST /attachments/presign | `attachments:109` | — ⚠ | any human — **takes no principal at all**, no audit row |
| GET /attachments/:id/url | `attachments:114` | — | agent+ in scope ✓svc `:89-94`; ⚠ any **admin** may fetch any *unlinked* upload `:91` |
| GET /notifications | `notifications:46` | — | self (`principal.id`) |
| GET /notifications/unread-count | `notifications:51` | — | self |
| POST /notifications/:id/read | `notifications:56` | — | self |
| POST /notifications/read-all | `notifications:61` | — | self |
| POST /chat/conversations | `chat:594` | `chat:write` | **machines only** — `:113` rejects humans, stricter than a role |
| GET /chat/conversations/:ref | `chat:601` | `chat:read` | machines only |
| POST /chat/conversations/:ref/messages | `chat:608` | `chat:write` | machines only |
| POST /chat/conversations/:ref/handoff | `chat:615` | `chat:write` | machines only |
| POST /chat/conversations/:ref/resolve | `chat:622` | `chat:write` | machines only |
| GET /chat/updates | `chat:629` | `chat:read` | machines only |

### auth · pm-identity · email · health
| POST /auth/login | `auth:17` | `@Public` | anyone |
| POST /auth/refresh | `auth:26` | `@Public` | anyone with a refresh token |
| POST /auth/logout | `auth:48` | `@Public` | anyone |
| POST /auth/forgot-password | `auth:56` | `@Public` | anyone (throttled) |
| POST /auth/reset-password | `auth:63` | `@Public` | anyone with a reset token |
| GET /auth/me | `auth:68` | — | self |
| POST /auth/change-password | `auth:74` | — | self, requires current password |
| GET /auth/pm/status | `pm:128` | — | any human |
| GET /auth/pm/start | `pm:142` | **admin** | admin |
| GET /auth/pm/signin | `pm:172` | `@Public` | anyone |
| GET /auth/pm/signin/redirect | `pm:189` | `@Public` | anyone |
| GET /auth/pm/callback | `pm:232` | `@Public` | anyone — state row + cookie binding, by necessity |
| GET /auth/pm/unlink | `pm:332` | **admin** | admin |
| POST /email/inbound | `email:63` | `@Public` | provider only — shared secret `:71` |
| GET /email/inbound-address | `email:106` | **admin** | admin |
| PUT /email/inbound-address | `email:112` | **admin** | admin |
| GET /health, GET /ready | `health:48,54` | `@Public` | anyone |

### Counts — settling the discrepancies

| | value | note |
|---|---|---|
| Mutating routes (POST/PATCH/PUT/DELETE) | **58** | verified by count, not 59 |
| Route-level `@Roles()` | **42** | 34 admin, 7 lead, 1 agent |
| Mutating routes **with** a role gate | **33** | |
| Mutating routes **without** one | **25** | 23 correct by design, **2 are holes** (organizations) |
| `@AllowApiKey` routes | **23** | all 23 carry a `@Scopes` |

The brief's "46 decorators / 35-9-2" counted four non-decorators: the doc comment at `common/decorators/index.ts:10` and three test *names* at `roles.guard.spec.ts:31,38,45`. The real figure is 42.

---

## 3. HOLES

Ranked by what an invited tester could actually do next week.

### 1. Any agent can create and rename any organization — including its `domain`
`organizations.module.ts:71` (POST) and `:76` (PATCH). No `@Roles`, no `@Scopes`, and `OrganizationsService.create/update` (`:43-53`) go straight to `prisma.organization.create/update`. The `principal` is passed in **only to write the audit row** — it is never checked.

Concretely: an agent can `PATCH /organizations/<id> {"domain":"acme.com"}` and re-point which organization inbound customers get matched into. That is not cosmetic — it silently re-parents customer records. They can also rename every organization on the desk. Every sibling resource of this exact shape (tags, teams, SLA) is `@Roles('admin')`.

The console exposes no UI for this, so it is not reachable by clicking — but a tester with a browser devtools console and a session cookie is one `fetch()` away, and `PERMISSIONS` has no `organizations` key at all, so nothing anywhere in the codebase records that this was ever considered.

**Fix:** add `@Roles('admin')` to both. Two lines.

### 2. The last admin can lock the workspace out of administration — permanently
No guard exists. Grep for `last admin|lastAdmin|sole admin|adminCount|only admin` across `src/` returns three unrelated comments and nothing else.

Three ways to do it, all as the sole admin acting on themselves:
- `PATCH /users/<self> {"role":"agent"}` — `users.module.ts:148-151`, no target check beyond workspace membership
- `DELETE /users/<self>` — `deactivate`, `:168-177`, flips `isActive` **and revokes every refresh token** `:174`
- `PATCH /users/<self> {"isActive":false}`

There is **no recovery path in the product**. Invitations, `POST /users`, and every admin route are `@Roles('admin')`; the auto-provisioning that mints an admin only fires for a workspace being *created* (`auth.service.ts:411,439`). Recovery is a `psql` UPDATE.

The only thing standing between this and a locked-out desk today is a hidden button in the console — and the frontend comment says so out loud (`Console.jsx:1880`): *"the backend has no self-guard, and deactivating yourself revokes your own tokens."* One stale tab, one curl, one scripted cleanup.

**Fix:** a `count` on `workspaceMembership where {role:'admin', isActive:true}` inside the `update` and `deactivate` transactions, plus an `id !== actor.id` check on role demotion. ~10 lines in `UsersService`.

### 3. An API key does what a lead cannot — two live bypasses
`tickets.service.ts:583` and `:643` both guard with `actor.kind === 'user' &&`, so for a machine principal **neither branch fires**:

- **Team move** (`:582-592`): a `tickets:write` key — including one *bound to a single team* — can `PATCH /tickets/:id {"teamId":"<any team>"}` and move a ticket anywhere. `resolveRouting` (`:209-220`) correctly confines a bound key on *create*, and its docstring states the invariant; `patch` does not uphold it.
- **Reopen** (`:643-645`): the check is `actor.kind === 'user' && actor.role === 'agent'`, so any `tickets:write` key can reopen closed tickets — an action `PERMISSIONS.tickets.reopen:'lead-team'` reserves for leads.

Both routes are `@AllowApiKey` + `@Scopes('tickets:write')` (`tickets.controller.ts:47-48`, `:59-60`), so this is live, not theoretical. `assertCanAssign` (`:659-677`) gets the same situation right and is the model to copy.

**Fix:** invert the guards to check the machine case explicitly rather than falling through it.

### 4. Any agent reads the entire customer book — two ways
- `GET /organizations/:id` (`:66`) has no role gate and `OrganizationsService.get` (`:34-41`) includes `customers: {id, name, email}`. Enumerate org by org, get every customer.
- `GET /customers` / `GET /customers/:id` (`:256`, `:263`) take **no principal at all** — `CustomersService` has no team filter anywhere.

The customers half *matches* `PERMISSIONS.customers.view:'any'`, so it is a deliberate decision, not a slip. The organizations half matches nothing. Either way this is the largest PII surface an agent has, and with outside testers arriving it is worth confirming it is what you meant.

### 5. Any `reports:read` key gets workspace-wide metrics, ignoring its team binding
`IntegrationsService.metrics()` (`integrations.module.ts:19-41`) takes no principal and applies no team filter — verified, the `where` clauses contain only status and date predicates. Meanwhile `ReportsService.teamScope` (`reports.module.ts:45-50`) explicitly refuses to let a bound key widen its scope, with a comment saying so.

So a partner key confined to one team is denied team-wide numbers by `/reports/summary` and handed instance-wide open/breaching/resolved counts by `/integrations/metrics`. RLS confines this to the tenant; it says nothing about teams. The asymmetry between the two services is clearly unintended.

### 6. The `TeamScopeService` doc comment is false, and the realtime layer believes it
`team-scope.service.ts:14` claims *"unrouted tickets (team_id null) are visible to leads and admins only."* The code does not do that. A lead's filter is `{teamId: <their team>}` (`:90`) — `null` matches nothing — and `assertCanAccess:64-67` throws `Outside your team`. Precisely:

- **admins** see unrouted tickets (`visibilityWhere` returns `{}`)
- **leads** see none — the opposite of the comment
- **agents** see unrouted tickets *assigned to them*, via the `OR: [{teamId}, {assigneeId}]` branch `:92-94` — also contradicting the comment

The realtime layer implements the **documented** rule instead of the real one: `realtime.gateway.ts:99-100` fans unrouted `ticket.*` events into the `role:lead` room, which leads join at `:134`. A lead gets a live toast for a ticket they will then get a 403 on. There is even a passing test pinning this — `realtime.gateway.spec.ts` *"scopes the unrouted-work room leads share"* asserts the rooms are `['role:admin','role:lead']`. **The test pins the divergence in place.**

Reachable via an admin nulling `teamId` (`tickets.service.ts:590` `disconnect: true`) or a workspace with no teams. Decide which rule is right, then make the comment, the REST filter, and the gateway agree.

### 7. An admin can download any other user's pending upload
`attachments.module.ts:89-94`: an attachment not yet linked to a message skips `loadAndAssert` and falls to `else if (principal.kind === 'user' && principal.role !== 'admin') throw`. So **any admin** can fetch **any** unlinked upload. Pairs badly with `POST /attachments/presign` (`:109`), which takes no principal at all — no actor recorded, no audit row, `BLOCKED_TYPES` the only gate.

Note the shape: `principal.kind === 'user' &&` — the same pattern that is live and wrong in hole #3.

### 8. Latent: `@Roles` with multiple roles WIDENS access
`roles.guard.ts:36` computes the **minimum**:
```ts
const min = roles.reduce((lowest, r) => (roleAtLeast(lowest, r) ? r : lowest), roles[0]);
```
`@Roles('admin','lead')` means *lead or above*. `@Roles('admin','agent')` means *everyone*. Anyone writing the NestJS-idiomatic "either of these" gets the loosest. No route lists two roles today, and the spec never passes a two-element array, so this is a trap rather than a bug.

### 9. Latent: two fail-open branches in the guard
- `roles.guard.ts:20` — `if (!principal) return true`. Safe **only** because `AuthGuard` runs first and throws. A `@Public()` route carrying `@Roles()` would be wide open. None currently does.
- `roles.guard.ts:22-27` — an API key on a route with **neither** `@Scopes` nor `@Roles` returns `true` unconditionally. All 23 `@AllowApiKey` routes carry a `@Scopes`, so this is unreachable today — but the pairing is a convention, not a check. The first `@AllowApiKey` added without a scope becomes callable by *every* key in the workspace regardless of its grants. Make that branch throw.

### 10. `PATCH /users/:id` disables a human on **every** desk
`users.module.ts:141-146` writes `isActive` to `prisma.user` with **no workspace filter**, because `users` is a global table outside RLS. An admin of desk A deactivates a contractor who is also seated on desk B and disables them product-wide. `deactivate` (`:168-177`) gets this right — it scopes to the membership, and its docstring at `:159-166` explains exactly why. `update` does not, and the two live twelve lines apart. `AuthGuard` never re-checks `users.is_active`, so the target keeps working until their access token expires.

### Not a hole, though it looks like one

**Ticket routes with no `@Roles` are correct.** `POST /tickets`, `PATCH /tickets/:id`, `assign`, `status`, `messages` are all ungated at the route and fully enforced in the service. That is the right call — these rules are per-field and per-row (an agent editing `priority` is fine; `teamId` is privileged; an agent self-assigning is fine; assigning *others* is not). A decorator cannot express any of that. Do not "fix" these.

**`@Roles('agent')` on `bot-enabled`** (`tickets.controller.ts:103`) is a no-op — `agent` is the floor, so `roleAtLeast` always passes, and the route has no `@AllowApiKey` so `AuthGuard` already excludes machines. Harmless, but it reads to a reviewer as *"someone thought about this route"* when it does nothing. Delete it or make it `lead`.

---

## 4. THE PERMISSIONS MATRIX

**Is it dead code?** The `PERMISSIONS` map: **yes, completely.** Its only importer is `permissions.spec.ts:1`. No guard, no service, no controller reads it. Its own header comment (`permissions.ts:1-4`) claims *"Guards and services read this, so the doc and the code share one source of truth"* — that sentence is false.

Its test is self-referential: `permissions.spec.ts:29-62` is a list of `expect(PERMISSIONS.x.y).toBe('admin')`. **It would stay green if every `@Roles` in the codebase were deleted.**

**But the file is not dead** — `roleAtLeast`/`ROLE_ORDER` (`:90-95`) are the live hierarchy imported by `roles.guard.ts:4`, and `API_SCOPES` (`:74-88`) is imported by `api-keys.module.ts:8` to validate the scope DTO. Both must stay.

**Does the map agree with reality?** Surprisingly, mostly yes. I checked all 40 entries; every rule it *states* is enforced somewhere — just never by reading the table. `assign_self`/`assign_others` → `assertCanAssign`; `move_team` → `:583`; `reopen` → `:643`; the `'team'` cells → `TeamScopeService`; `canned_responses.manage_team/global` → `assertManage`; `reports.own/team/instance` → `teamScope`; `teams.edit_membership` → `setMembership`; every `'admin'` cell → a real `@Roles('admin')`.

### Every disagreement

| # | matrix says | reality | verdict |
|---|---|---|---|
| 1 | `tickets.bulk: 'lead-team'` | True of the endpoint (`@Roles('lead')`), **false of the product**. The console never calls `POST /tickets/bulk`; `Console.jsx:671-676` implements bulk as `Promise.all(ids.map(id => this.api.patchTicket(id, patch)))` — N × `PATCH /tickets/:id`, which has no `@Roles`. An agent selects 25 rows and closes them. | **Real gap.** The lead gate and its unit test guard an endpoint the product does not use. Note the backend is *arguably* right — closing is `transition:'team'`, allowed to agents — but then the `bulk` rule is fiction. |
| 2 | `users.manage: 'admin'` | Holds for *who* may call it, but a matrix of roles has no vocabulary for *"not on yourself"* or *"not the last one"*. The self-lockout hole is structurally invisible to it. | **Expressiveness limit**, not an error. |
| 3 | *silence* on `organizations` | Two completely unguarded write routes. | **Worst one.** The map's silence is indistinguishable from an intentional `'any'`. |
| 4 | *silence* on `chat`, `notifications`, `attachments`, `search`, `invitations`, `business_hours` | All exist and are enforced (or not) elsewhere. `business_hours` is admin-only in reality; a reader would look under `sla.manage` and guess. | Stale — the map stopped being maintained. |
| 5 | `tickets.reopen: 'lead-team'`, `move_team: 'lead-team'` | True for humans; **false for API keys** (hole #3). | The map has no vocabulary for machine principals at all. |
| 6 | `reports.own: 'any'` vs `tickets.view: 'team'` | Two *different* definitions of what an agent sees: `teamScope` agent branch is `{workspaceId, assigneeId}` (`reports.module.ts:59`), `visibilityWhere` agent branch is `OR:[{teamId},{assigneeId}]` (`team-scope.service.ts:92-94`). | **Real drift.** An agent's "open tickets" KPI on the reports screen will not match the count in their own inbox, and reports is narrower. Not a security hole — a correctness and support-burden one. |

### Recommendation: **delete the map, keep the file**

Wiring it properly is not achievable. The rules `'team'` and `'lead-team'` are *row* rules — they need a loaded ticket, a team id and an assignee. Only `'any'` and `'admin'` are expressible as a guard, and those are exactly the cells already correctly encoded as `@Roles('admin')`. Wiring would move four facts from a place that works to a place that adds indirection.

So:
1. **Delete `PERMISSIONS` and its spec block** (`permissions.ts:12-71`, `permissions.spec.ts:26-70`). Keep `ROLE_ORDER`, `roleAtLeast`, `API_SCOPES` and their tests.
2. **Replace it with the test that actually pays for itself:** walk the Nest route table at boot and assert every route carries either `@Roles`, `@Scopes`, `@Public`, or an explicit `@NoAuthzRequired` marker. That catches the organizations hole, catches the *next* one automatically, and cannot drift — see §6.
3. Move §8.3 of the backend doc to point at the decorators.

What I would **not** do is leave it. It reads as authoritative, it is imported by nothing, and the two things a reader would most want to trust it about — organizations and self-demotion — are exactly where it is silent.

---

## 5. MISSING FOR A REAL PRODUCT

### Last-admin protection — **fix before testers arrive**
See [hole #2](#2-the-last-admin-can-lock-the-workspace-out-of-administration--permanently). ~10 lines, no recovery path exists without it, and the frontend already carries a comment admitting the backend doesn't do this.
**Recommend:** a shared `assertNotLastAdmin(workspaceId, targetId)` called from `update` (on role demotion or `isActive:false`) and `deactivate`, inside the existing transactions. Plus reject self-demotion outright — an admin who wants to step down should be demoted by another admin.

### Role-change auditing — **written, but unreadable**
The data is already there and correct: `UsersService.update` writes a full `{before, after}` diff (`users.module.ts:155`), `deactivate` writes one (`:175`), `setMembership` writes `member.add`/`member.remove` (`teams.module.ts:112`), invitations write `{email, role, teamId}` (`invitations.service.ts:159`). `GET /audit` exists and is admin-gated (`audit.controller.ts:12-13`). The client method exists — `frontend/lib/api/endpoints.js:205`.

**No component calls it.** The screen was never built. So the only record that someone became an admin is a database row nobody in the product can read.
**Recommend:** this is the cheapest high-value item on the list — one read-only table view behind the existing admin-gated endpoint. Combined with an invite flow that can mint admins (`invitations.dto.ts:12-13`) and no last-admin guard, it is also the one that turns an incident into an explicable incident.

Note one blind spot the screen won't cover: **PM sign-in mints CS admins out of band.** `auth.service.ts:438-440` (`ensureDeskMembership`) creates `role:'admin'` with no CS admin involved, gated only on the caller holding a PM P0/P1 role in a linked PM workspace (`:157-162`). It is create-if-missing, never update (`:432-436`), so it cannot re-promote someone a CS admin demoted — but for a person with no membership yet, a PM role alone confers CS admin, and it is invisible to any route-level audit.

### A role management UI — partially there, three gaps
What exists is correct: the edit modal patches role + team, and its note (`Console.jsx:1100`) correctly says it touches this desk only, matching `UsersService.update` writing to `workspaceMembership` (`users.module.ts:148`). What's missing:
- No way to see a person's **other** memberships — yet roles are per-desk and one human can hold two. An admin demoting someone cannot see what that does elsewhere (and per hole #10, `isActive` genuinely does affect elsewhere).
- No way to add an **existing** user to this desk except by re-inviting them.
- **No team-membership UI at all** — `POST /teams/:id/members` (`teams.module.ts:153`) has no console caller. The lead's one genuine administrative power is unreachable from the product.

**Recommend:** the third is the real gap, because it makes `lead` mean nothing in the UI (below). The first is a correctness issue worth a read-only line in the edit modal.

### Is `lead` coherent? — **on the backend yes, in the console no**
On the backend `lead` is well-defined and load-bearing: own-team row scope (`team-scope.service.ts:89-91`), reopen, bulk, merge, team-scoped canned responses, membership edits within their team. Six real capabilities, each enforced.

In the console `lead` means exactly two things: *you can see the settings nav* (`canAdmin: S.role !== 'agent'`, `Console.jsx:1739`) and *you can write canned responses* (`canManageCanned`, `:1897`). Everything else the settings nav grants access to, it grants access to **look at** — of the nine tabs that render unconditionally (`Settings.jsx:37-45`), three are admin-gated, two are read-only, one (API keys) offers a **"generate key"** button that always 403s (`Settings.jsx:420-503` has no role gate; `Console.jsx:858` toasts *"couldn't generate a key — admin only"*), and one (webhooks) shows an **empty table with no error**, because `adapter.js:305` hard-codes `webhooks = []` for non-admins and `loadSettingsTab` refuses to ask (`Console.jsx:1019`) — so it reads as *"this desk has no webhooks"* rather than *"you may not see them."* The overview card two clicks earlier says "3 endpoints · 1 failing" (hardcoded, `Console.jsx:277`).

Meanwhile a lead's *actual* powers — reopen, reassign within team, move team — live on the ticket screen and are not surfaced as capabilities at all. They are the same menus an agent sees, which happen to work for a lead and produce a generic *"hmm, that didn't save"* (`Console.jsx:698`) for an agent. The agent is never told why.

**Recommend:** two things, in order. (1) Gate the API-keys and webhooks tabs on `canManageDesk` — they are the two places the hand-sync between `canManageDesk` and `@Roles('admin')` was dropped, and the webhooks one actively misinforms. (2) Surface 403 reasons on the ticket screen instead of the generic toast — the backend already returns good messages (*"Reopening a closed conversation needs a lead"*, *"Agents can only assign themselves within their team"*) and the console throws them away.

### Dead controls that announce success — not RBAC, but adjacent and live
`askSpam` (`Console.jsx:825-830`) shows a confirm dialog, toasts **"marked as spam"**, navigates back to the queue, and **sends nothing**. `mergeTicket` (`:832`) and `copyLink` (`:831`) are toast-only. `bulkTag` (`:655-660`) fires un-awaited patches and toasts success unconditionally. A tester will find these in the first hour and report them as data loss.

---

## 6. WHAT IS PROVEN vs ASSUMED

### Proven — against a real Postgres
`test/integration/` (7 specs, real database):
- **`team-scope.integration.spec.ts`** — row-level team scope for every principal shape: admin, lead, agent, team-less lead, team-less agent, bound key, unbound key. Asserted on **rows actually returned**, not on filter shape (`:43-98`), plus `visibilitySql` ≡ `visibilityWhere` equivalence (`:111`). **This is the only RBAC behaviour in the codebase with a genuine end-to-end proof, and it is the one that matters most.**
- `workspace-isolation` / `db-roles` — tenancy and RLS. Real, but tenancy is not roles.

### Assumed-with-mocks — real logic, no wiring
- **`tickets.service.spec.ts`** (Prisma stubbed, header comment `:7`) — assignment authorization ×6, team moves ×3, reopen ×2, bulk-closed-to-agents, merge-closed-to-agents, delete scoping. Genuinely good decision-logic coverage. Two caveats: stubbed Prisma proves *"the query I would send"*, not *"the rows I get"*; and the bulk test guards an endpoint the console never calls.
- **`roles.guard.spec.ts`** — the hierarchy and the scope algebra, thoroughly (`:30-79`). But it constructs `RolesGuard` with a hand-rolled fake `Reflector`. **It proves the function is right. It proves nothing about which routes carry which decorator.**
- `team-scope.service.spec.ts` — filter shapes; superseded by the integration suite.
- `permissions.spec.ts` — asserts the table against itself. Proves nothing about enforcement.
- `settings-writes.test.js` (frontend, jsdom, endpoints mocked) — 20 tests, genuinely good on *"never announce an outcome you didn't cause."* `:101` pins `canEdit`/`canDeactivate` for admin/lead/self; `:286` pins that a lead doesn't request admin-only rows.

### Assumed — nothing at all

- **That `@Roles` is on the routes it should be on.** There is no HTTP-level RBAC test anywhere; `test/health.e2e-spec.ts` is the only e2e file, and `app.module.spec.ts` only checks that Nest can resolve the provider graph. **Delete `@Roles('admin')` from `POST /api-keys`, `PUT /email/inbound-address`, `DELETE /users/:id` or `POST /invitations` and the entire suite stays green.** Given that authorization here lives *entirely* in decorator placement, this is the largest gap in the codebase — larger than any individual hole in §3, because it is the one that lets the next hole in silently.
- **Reports role scoping.** `reports.module.ts:37` states *"reports-scope.integration.spec.ts asserts that."* **That file does not exist** — I listed `test/integration/`; there are seven specs and none is it. The claim that an agent's report is limited to their own assignments is asserted by nothing. (It *is* correctly implemented at `:45-60` — but the comment cites a proof that isn't there, which is worse than no comment.)
- Self-deactivation / last-admin — no test, because no behaviour.
- Organizations authorization — no test, no behaviour.
- Canned-response `assertManage` (the lead-own-team rule) — no test.
- `setMembership`'s lead restrictions (`teams.module.ts:98-104`) — no test.
- The API-key bypasses in `tickets.service.ts:583,643` — no test; the existing reopen tests only exercise human actors, which is precisely why the bypass survived.
- Console ↔ backend agreement. Nothing checks that `canManageDesk` corresponds to `@Roles('admin')`. The two lists were kept in sync by hand and by comment (`Console.jsx:1879,1893,1931`, `Settings.jsx:118`); API keys and PM-connect are where that hand-sync was dropped.

### The one test to write
A boot-time route-table walk asserting every route carries `@Roles`, `@Scopes`, `@Public`, or an explicit opt-out marker. It would have caught organizations on the day it was added, it catches the next one for free, and it is the only test on this list that gets *more* valuable as the codebase grows. Pair it with an HTTP-level spec hitting ~8 representative routes as agent/lead/admin.

---

## Appendix: where the three audits disagreed

| point | resolution |
|---|---|
| `@Roles` count: 46 vs 42 | **42.** The grep total includes a doc comment (`common/decorators/index.ts:10`) and three test *names* (`roles.guard.spec.ts:31,38,45`). Distribution 34 admin / 7 lead / 1 agent — counted directly. |
| Mutating routes: 59 vs 58 | **58**, counted. 33 carry a role gate, 25 do not, and 23 of those 25 are correct by design. |
| `@AllowApiKey` count: 19 vs 13 | **Neither — 23.** Both audits were wrong on the number but right on the substance: every one of the 23 is paired with a `@Scopes` on the following line, so `roles.guard.ts:26` is unreachable today. |
| Unrouted tickets: "admin-only" vs the doc's "leads and admins" | **Both incomplete.** Admins see them; leads see none; **agents see them when assigned to themselves**, via the `OR` branch at `team-scope.service.ts:92-94`. The doc comment at `:14` is wrong in both directions. |
| Is `permissions.ts` dead code? | **The map is; the file is not.** `roleAtLeast`/`ROLE_ORDER` are imported by the guard and `API_SCOPES` by the API-keys DTO. Delete `PERMISSIONS` only. |
| Whether the ungated ticket routes are a hole | **Not a hole.** All five are fully enforced in the service, per-field and per-row, in ways a decorator cannot express. Confirmed by reading `tickets.service.ts:214-229, 582-592, 643-645, 658-704`. |
| Console bulk: does the lead gate bind? | **No.** `Console.jsx:675` is `Promise.all(ids.map(id => this.api.patchTicket(id, patch)))` — verified. `POST /tickets/bulk` has no console caller. |
