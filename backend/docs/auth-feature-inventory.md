I verified the disputed and load-bearing claims directly against the tree. Here is the document.

---

# Plumo CS — Authentication readiness before tester week

**Repo:** `C:/Users/firas/OneDrive/Documents/plumocs` · **HEAD:** `17e3137` · **Compiled:** 2026-08-07
**Amended:** 2026-08-07, after three changes landed — the settings mocks, the CI integration blocker, and the dual-membership refresh. Amendments are marked **[08-07]** and the original wording is left standing wherever it is still true. **Nothing was upgraded because code was written.** Three rows moved to EXECUTED and every one of them moved because the test was run and watched, not because it now exists; the reasoning is in §3.8, which is also where the four things that ran and *failed* are recorded.

**How to read the status column.** This is the only thing in this document that matters.

| | Meaning |
|---|---|
| **EXECUTED** | Proven by running it against the live system or a real database. |
| **MOCKED** | A unit test asserts it, but Prisma/HTTP is faked. Green means the logic branched correctly — not that it works. |
| **UNRUN** | The code exists and has never executed anywhere, ever. |
| **UNDEFINED** | Nobody has decided what should happen. No code, no test, no answer. |

Nothing below is called working because a test passes. Where four separate passes over this code disagreed, I re-read the source myself and say which one is right in **§7**.

---

## 1. FEATURE INVENTORY

| Feature | Entry point | Status | Note |
|---|---|---|---|
| Password login | `POST /auth/login` → `backend/src/auth/auth.service.ts:121-138` | **EXECUTED** | You use it daily. There is **no spec file for `login()`** — it works because you use it, and for no other reason. |
| Access token issue / claims | `auth.service.ts:653-702` | **EXECUTED** | `{sub, name}` only; role and team deliberately re-read per request. |
| Refresh rotation | `POST /auth/refresh` → `auth.service.ts:445-468` | **EXECUTED** (implicitly — your console outlives 15 min) | Rotation is correct. Reuse detection is absent. |
| Logout | `POST /auth/logout` → `auth.service.ts:470-483` | **UNRUN** | Revokes exactly the presented jti. Not on your verified list. |
| Change password while signed in | `POST /auth/change-password` → `auth.service.ts:634-651` | **UNRUN** | Zero tests of any kind. Verified: no spec covers it. |
| Forgot-password request | `POST /auth/forgot-password` → `auth.service.ts:521-592` | **EXECUTED** | Real email, real inbox, link opens. Confirmed today. |
| Reset-password page render | `frontend/app/reset-password/page.jsx` | **EXECUTED** (opens) | Only the render is proven. |
| Reset-password redemption | `POST /auth/reset-password` → `auth.service.ts:594-631` | **UNRUN** | Whether submitting the form actually changes the password is unconfirmed. |
| Continue with Plumo — server logic | `auth.service.ts:155-224` | **EXECUTED** | Role gate, desk lookup, `sub` resolution. This ran twice in production. |
| Continue with Plumo — new front door | `GET /auth/pm/signin/redirect` → `backend/src/pm-identity/pm-identity.module.ts:188-210` | **UNRUN** | Added in `e3ee0d6` *after* your successful sign-ins. Nobody has clicked it. |
| OAuth binding cookie (session-fixation fix) | `pm-identity.service.ts:51-54`, `:267-274` | **MOCKED** | Tested against a service built with `{}` for Prisma. No browser has ever stored it. |
| PKCE + state + discovery + DCR | `pm-identity.service.ts:99-213`, `:368-392` | **EXECUTED** | A real token was obtained, which requires all of it. |
| Desk auto-provisioning on first PM sign-in | `auth.service.ts:299-388` | **EXECUTED** — twice | The strongest item in this document. |
| PM account linking from Settings | `GET /auth/pm/start` → `pm-identity.module.ts:142-176` | **UNRUN** — and believed broken two ways | See §3.7. |
| PM unlink | `GET /auth/pm/unlink` → `pm-identity.module.ts:332-337` | **UNRUN** | Code path looks correct. |
| Invitation create + send | `POST /invitations` → `backend/src/invitations/invitations.service.ts:92-206` | **UNRUN** | **No invitation has ever been created, sent, or accepted.** |
| Invitation lookup | `GET /invitations/token/:token` → `invitations.service.ts:290-349` | **UNRUN** | ~~Depends on a `SECURITY DEFINER` function never called against a real DB.~~ **[08-07]** The function underneath it now has been — `app_resolve_invitation` returns the right row, on an unbound `plumo_app` connection, in `workspace-isolation.integration.spec.ts`, executed (§3.8). **The endpoint is still UNRUN**: the spec calls the SQL directly, so the grant and the column aliases are proven and the controller, DTO and service around them are not. |
| Invitation accept | `POST /invitations/token/:token/accept` → `invitations.service.ts:352-533` | **UNRUN** | The bind-then-write sequence is the riskiest untested code you have. |
| Invitation revoke | `DELETE /invitations/:id` → `invitations.service.ts:254-284` | **UNRUN** | Not covered by any test in its own spec file either. |
| Invitations table RLS + resolver + partial index | `backend/prisma/migrations/20260807190000_invitations/migration.sql:253-300` | **EXECUTED** (SQL only) | The migration asserts its own invariants inside its transaction. Proves the schema, not the service. **[08-07]** Now proven by something outside the migration too: four cases in `workspace-isolation.integration.spec.ts`, run and passing (§3.8). A seat offered on one desk is invisible from the other; the pending-email index is per-workspace, not global; `app_resolve_invitation` reads across the policy as designed; an unknown digest returns nothing. The migration only ever asserted the function was *marked* `prosecdef` — until this run, nothing had **called** it. |
| Role hierarchy gate (`@Roles`) | `backend/src/common/guards/roles.guard.ts:14-41` | **MOCKED** | Pure function, genuinely proven. Fabricated `ExecutionContext`s. |
| `PERMISSIONS` matrix | `backend/src/common/permissions.ts:14-71` | **UNRUN as enforcement** | Grep confirms **no guard and no service reads it**. It is documentation with a test asserting the documentation against itself. |
| Team-scope row filtering | `backend/src/common/guards/team-scope.service.ts:53-115` | **[08-07] EXECUTED** | ~~⚠️ Downgraded from EXECUTED — see §7.1. The CI job that would prove it has never run.~~ It has now run — not in CI, on a throwaway PostgreSQL 17.2 cluster, migrated by the new two-pass recipe and connected as unprivileged `plumo_app`. `team-scope.integration.spec.ts` passes. Read §3.8 for exactly what that does and does not license. |
| Tenant isolation (RLS between the two desks) | `backend/test/integration/workspace-isolation.integration.spec.ts` | **[08-07] EXECUTED** | ~~⚠️ Same reason. Not proven by anything that has executed.~~ **The single biggest change in this revision.** The whole spec passes, including `global-setup.ts`'s refusal to run as a privileged connection — which is what makes a pass mean anything, since an owner or superuser is exempt from every policy and would report perfect isolation with no policies at all. Caveat in §3.8: PG 17.2 not the runner's 18, and the CI job that is supposed to do this on every push is **still red for other reasons**. |
| Per-request membership re-read | `backend/src/common/guards/auth.guard.ts:69-72` | **EXECUTED** | Runs on every authenticated request you make. Good design. |
| Single-desk workspace resolution | `workspace-context.service.ts:108-111` | **EXECUTED** | This is what keeps your login working on a two-workspace instance. |
| Two-desk workspace resolution | `workspace-context.service.ts:115-118` | **MOCKED** (the 403) / **UNRUN** (the lockout) | See §3.1. The invitation feature is what will create the first two-desk user. **[08-07]** The client half is fixed and the status does **not** move: `/auth/refresh` now names its desk, so the 403 is no longer reached, but no browser has held a two-membership session across a token expiry. The fix is asserted by `dual-membership-refresh.spec.ts` (backend, 5 cases, real controller + real service + real `WorkspaceContextService`) and `refresh-workspace.test.js` (frontend, 5 cases) — both MOCKED at the Prisma boundary. §3.1 has the new chain. |
| **[08-07]** RLS coverage of every `workspace_id` table | `db-roles.integration.spec.ts` | ~~**EXECUTED — and it fails**~~ **[08-08] EXECUTED and green, with nothing subtracted** | Ran for the first time and immediately earned its keep: **`pm_oauth_states` carried `workspace_id` with row-level security OFF and zero policies.** Resolved in §3.15 by renaming the column to `link_workspace_id` — it was never a tenant key. The exemption list the finding was parked in is **gone**, not emptied: the assertion is now `expect(unprotected).toEqual([])` with no filter in front of it. |
| API key issue + use | `POST /api-keys` → `backend/src/api-keys/api-keys.module.ts:64-79` | **EXECUTED** | You have minted console keys and used them. |
| API key revoke | `DELETE /api-keys/:id` → `api-keys.module.ts:82-88` | **UNRUN** | No test revokes a key and re-authenticates. |
| API key expiry | column + `auth.guard.ts:96-99` | **UNRUN** / **UNDEFINED** | Verified: `CreateApiKeyDto` (`api-keys.module.ts:10-23`) has **no `expiresAt` field**. Every key ever issued through the product is immortal. |
| Rate limiting — proxy trust | `backend/src/common/guards/principal-throttler.guard.ts` | **MOCKED, but strongly** | Uses a **real** `FastifyAdapter` with real injected requests. The forgery bypass is genuinely closed. |
| Rate limiting — the counting | `backend/src/app.module.ts:60-70` | **UNRUN** | In-memory, per-process store. Never exercised under load. |
| Deactivate a user from the console | `frontend/components/screens/Settings.jsx` | **UNRUN** | ~~**— and it is wired to a mock**~~ **[08-07]** The mock is gone; the button calls `DELETE /users/:id`, prints its success line only after a 2xx, and is not rendered on your own row. **Status stays UNRUN — nobody has clicked it against a real server.** What changed is that failure is now silent-and-safe rather than silent-and-reassuring. See §3.2. |
| Deactivate a user via API | `DELETE /users/:id` → `backend/src/users/users.module.ts:239-243` | **UNRUN** | ~~Verified: **no call site anywhere in the frontend.**~~ **[08-07]** It has one now (the row above). The endpoint itself is unchanged and still has never been called by anything. |
| **[08-07]** Inbound email address — the desk's on/off switch | `PUT /email/inbound-address` → `frontend/components/screens/Settings.jsx` | **UNRUN** | The highest-value find in the settings audit. Provisioning leaves `workspaces.inbound_email` NULL and the desk **refuses all inbound mail** until an admin sets one; the field that appeared to save it saved nothing. Now wired, with empty meaning an explicit `null` (channel off) rather than an omitted field. Never executed. |

---

## 2. TREATED CASES — what genuinely works today

Short by design. Everything here is either EXECUTED or is a correctness property I could verify by reading, and I say which.

### Password login (EXECUTED)
Correct password + exactly one active membership → signed in. On a two-workspace instance this still works for single-desk users because `resolveForUser` asks "does *this human* belong to exactly one desk?" before reaching for any instance default (`workspace-context.service.ts:98-111`). That fallback was added deliberately and it is the reason creating the second workspace was a data change and not an outage.

### Continue with Plumo (EXECUTED, twice)
A PM P0/P1 signs in, and if their org has no desk yet, one is created — desk + "Support" team + 4 SLA policies + admin seat + audit row, in a single transaction (`auth.service.ts:299-388`). This is the best-proven feature in the product.

### Forgot password → email (EXECUTED)
A real address produces a real email with a working link. The response is `{ok:true}` for every address (`auth.service.ts:591`), so it does not reveal whether an account exists. The "you sign in with Plumo, there is no password" explanation goes in the *mail*, not the response — a deliberate and correct choice (`auth.service.ts:546-552`).

### Secret storage (verified by reading — genuinely good)
Nothing anywhere stores a credential in plaintext that shouldn't be:

| Secret | Stored as |
|---|---|
| Passwords | argon2 (`auth.service.ts:263, 622, 643`) |
| Refresh tokens | sha256 (`auth.service.ts:681`) |
| Reset tokens | sha256 (`auth.service.ts:580`) |
| Invitation tokens | sha256 (`invitations.service.ts:145`) |
| API keys | sha256 + 12-char prefix (`auth.guard.ts:87-88`) |
| PM-provisioned accounts | argon2 over 32 random bytes, not a sentinel (`auth.service.ts:263`) — keeps the ordinary verify path valid |
| OAuth `code_verifier` | plaintext, correctly — PKCE requires replaying it verbatim (`pm-identity.service.ts:206`) |

### Not leaking which accounts exist (verified by reading)
One message for "no such workspace", "suspended" and "not a member" (`workspace-context.service.ts:130-136`). Uniform `valid:false` on invitation lookup with a hex shape-check before the query (`invitations.service.ts:311, 553`). One message for unknown/expired/consumed OAuth state (`pm-identity.service.ts:356-361`). All correct.

### Authority is re-read on every request, not baked into the token (EXECUTED)
`auth.guard.ts:69-72` re-resolves the membership from the database on every authenticated request, and the comment at `:63-68` explains why. A membership revoked at 10:00 stops working at 10:00, not 10:15. This is right, and it is the reason §5 is not worse than it is.

### Concurrency, correct by construction (verified by reading, never run)
- Two PM sign-ins provisioning one org: `INSERT … ON CONFLICT (pm_workspace_id) WHERE pm_workspace_id IS NOT NULL DO NOTHING` (`auth.service.ts:313-318`), loser adopts the winner's desk. The partial-index predicate is correctly repeated in the inference clause — load-bearing and easy to get wrong.
- Two clicks on one invitation link: conditional `UPDATE … WHERE accepted_at IS NULL AND revoked_at IS NULL` returning a count (`invitations.service.ts:444-452`). The loser's entire transaction, new account included, rolls back.
- Replayed OAuth callback: `updateMany` with `consumedAt: null` in the filter (`pm-identity.service.ts:352-355`).

### Rate limiting behind the proxy (the strongest test in the repo)
`principal-throttler.guard.spec.ts:104-137` boots a **real** Fastify adapter with the real `trustProxy` value and injects requests. It proves `req.ip` resolves to the rightmost `X-Forwarded-For` entry, that padding the chain doesn't walk left, and that an unproxied deployment ignores the header. **The header-forgery bypass is genuinely closed.**

### Token handling in transit (verified by reading)
The PM callback returns the session in a URL **fragment**, not a query string (`pm-identity.module.ts:304`) — fragments are never sent to servers, so this stays out of access logs and Referer headers. The console strips it with `replaceState` *before* the first `await` (`frontend/components/Console.jsx:118`). The reset and invite pages do the same (`reset-password/page.jsx:89`, `accept-invite/page.jsx:170`). All three are correct.

### Roles, as actually enforced
`roles.guard.ts:34-40` with a hierarchy (`admin ⊇ lead ⊇ agent`). 46 `@Roles` decorators. API keys are never a role, scopes never inherit, and a key hitting a `@Roles` route with no `@Scopes` is refused outright with "This route is human-only" (`roles.guard.ts:25`). **No invitation route carries `@AllowApiKey`** — verified by reading `invitations.controller.ts:26-70`. A partner's key cannot create members.

---

## 3. NOT TESTED — code exists, has never run

This is the section that matters. Each item: what breaks if it is wrong, and the smallest thing that would tell you.

### 3.1 Anyone on two desks is locked out, and the screen says "incorrect email or password"

**Status: MOCKED (the 403) / UNRUN (the lockout in a browser).**

> **[08-07] BOTH HALVES OF THIS ARE NOW FIXED IN CODE, AND THE STATUS DOES NOT MOVE.** Steps 1–2 and 6–7 of the chain below no longer describe the tree. The lockout has still never been reproduced *or* refuted in a browser, and it is still the case that no two-membership user has held a session across a token expiry. Read the chain as the record of a diagnosis, and the two notes under it as what replaced each end.
>
> **The refresh end (steps 1–2).** `client.js`'s `rawRequest` used one flag for two unrelated questions: `auth` meant both "carry a bearer token" and "name the desk". `/auth/refresh` is legitimately `auth: false` — it has no access token to send — and that silently also meant "say nothing about which tenant", which is what turned a 403 into a fifteen-minute logout loop. It now takes a separate `workspace` option, defaulting to `auth` so every other caller is unchanged, and the refresh passes `workspace: true`. The route already read the header (`auth.controller.ts`); only the client was silent. A body field was rejected deliberately: `main.ts` runs `forbidNonWhitelisted`, so an unknown field is a 400 until `RefreshDto` grows one, and login can only ever use the header because its body is the credential.
>
> **It cannot move you between tenants** — the question worth asking of any fix in this area, because doing so silently would be worse than the logout. Two independent reasons. The server resolves `app_resolve_membership(user, slug)`, which binds *both* arguments, so a named refresh returns that desk's membership or nothing; there is no branch that resolves a different one. And the client compares the slug it asked for against the slug it got back (case-insensitively — the column is `citext`) and throws `WORKSPACE_MISMATCH`, killing the session, if they differ. Verified by reading both sides end to end. The one case that still resolves by inference is a session stored *before* `workspace` existed: it sends no header, falls to `soleMembership()`, and therefore only ever lands on the single desk that user belongs to — the refresh now adopts the server's answer, so it learns its desk there instead of waiting for the next `/auth/me`.
>
> **The message end (steps 6–7).** `Login.jsx` exports `loginErrorMessage(err)` and renders it: `status 0` → unreachable server, `429` → rate limit, `WORKSPACE_MEMBERSHIP_DISABLED` → "an admin can switch it back on", any other 403 → "can't reach this workspace", everything else including 401 → the original credential line. To make 403 distinguishable without matching on strings, the two refusals in `workspace-context.service.ts` now carry codes (`WORKSPACE_ACCESS_DENIED`, `WORKSPACE_MEMBERSHIP_DISABLED`, `WORKSPACE_NOT_NAMED`); the messages are unchanged and the three collapsed cases stay collapsed. **No enumeration is introduced**: unknown address, deactivated account and wrong password still return one identical 401 line — pinned by a test asserting the two are byte-identical — and every 403 line is only reachable *after* the password has verified.
>
> **Step 6 was the whole feature, and it was still broken after the above landed.** `Console.jsx` caught the error and stored `loginError: true`, discarding `status` and `code` one frame before `loginErrorMessage` could read them, so all five messages collapsed back to the credential line. Fixed here (`loginError: e ?? true`) and pinned by three cases in `login-errors.test.js` that drive the real `signIn` handler rather than the formatter — confirmed to fail against the old line and pass against the new one.

The chain, every link verified:

1. `frontend/lib/api/endpoints.js:12-13` — `/auth/login` and `/auth/refresh` are both `auth: false`.
2. `frontend/lib/api/client.js:109` — the `x-workspace-slug` header is attached **only** when `auth` is truthy. Those two endpoints structurally cannot name a workspace.
3. `workspace-context.service.ts:108-111` → `soleMembership()` returns `null` for a user with ≠1 active membership.
4. Falls to `soleSlug()` → `null`, because production has two active workspaces (`:329-336`).
5. `:115-118` throws **403** `More than one workspace exists — name yours with the x-workspace-slug header`.
6. `Console.jsx:952-953` catches *any* error and sets `loginError: true`.
7. `Login.jsx:141-149` renders a **hardcoded literal**: `incorrect email or password. no harm done — try once more.`

The mocked test that pins step 5 is `backend/src/common/workspace/sole-membership.spec.ts:99-109` — *"refuses rather than guessing when the user belongs to several desks"*. It passes.

**The nastier variant.** Someone already signed in to desk A accepts an invitation to desk B (`invitations.service.ts:476-484` creates the second membership). The accept **works**, because it resolves on the invitation's own slug (`:525`). They land inside and everything is normal — until their access token expires. Then `client.js:161` fires a refresh, `/auth/refresh` goes out with no header, gets the 403, and `client.js:163-167` does `setSession(null)` and drops them on the sign-in screen — where they can never get back in. The cause and the symptom are 15 minutes apart.

> **What breaks:** one tester is silently and permanently locked out, with an error message that tells them to keep retrying their password. **The invitation feature you shipped tonight is the thing that will create the first two-desk user.**
>
> **Smallest test:** invite a second address you control to the *other* desk from the account you already use. Accept it. Wait 20 minutes. Try to log in.
>
> **Also worth knowing:** you can log in today, which means you do **not** currently have two active memberships — or `WORKSPACE_DEFAULT_SLUG` is set on the server. One of those two is true and you should find out which (see §6).

### 3.2 The console's "deactivate" button is wired to a mock and does nothing

**Status: UNRUN — the backend path has no caller at all.**

Verified directly:

```
frontend/components/screens/Settings.jsx:110
  <button onClick={V.askMock}
          data-title={'deactivate ' + u.name + '?'}
          data-body="they'll lose access but their replies stay on every ticket…"
          data-msg={u.name + ' deactivated'}>

frontend/components/Console.jsx:231-234
  askMock = (e) => { … action: () => { this.setState({confirm:null}); this.toast(d.msg || 'done ✿'); } }
```

It opens a confirmation dialog that says *"they'll lose access"*, then fires a toast that says *"&lt;name&gt; deactivated"*. **It calls no API.** The "edit" button beside it is `V.mock`. `frontend/lib/api/adapter.js` has no user-deactivate method — the only `users.*` calls are `updateSelf` and `list`.

`DELETE /users/:id` (`users.module.ts:239-243`), the one path that both deactivates the membership *and* revokes refresh tokens (`:170-174`), **has no call site anywhere in the frontend.**

> **What breaks:** during a test week you will at some point want to remove someone. You will click deactivate, be told it worked, and they will retain full access indefinitely. This is silently wrong in the *reassuring* direction, which is the worst kind.
>
> **Smallest test:** none needed — grep already proves it. ~~**Removing someone this week requires `curl` or SQL. Know that before you need it.**~~

#### [08-07] All 18 mock call sites are gone — 12 wired, 6 removed

`V.mock` / `V.askMock` no longer appear anywhere in `Settings.jsx`. **None of this is EXECUTED.** Every row below is UNRUN: the code was written and unit-tested, and no button has been pressed against a real server. The reason to record it here is that the failure mode has changed shape — a control that does nothing now *looks* like it did nothing.

**Wired (12).** All are `@Roles('admin')` on the server except canned responses (`lead`), and the console renders no button where the role would be refused — a lead sees nothing rather than a button that answers 403.

| Control | Endpoint | Worth knowing |
|---|---|---|
| team row **deactivate ✕** | `DELETE /users/:id` | The dangerous one, above. Confirmation kept; success line only after 2xx; the person disappears from the list so an admin can *see* it took; failure toasts the server's message and leaves them in place. **Not rendered on your own row** — the backend has no self-guard and deactivation revokes refresh tokens globally, so an admin could sign themselves out mid-sentence. |
| team row **edit** | `PATCH /users/:id` | Sends only what changed; explicit `null` clears the team. |
| sla **add a policy** | `POST /sla-policies` | Opens the real form; the header button previously toasted "policy saved". |
| sla row **edit** | `PATCH /sla-policies/:id` | Priority deliberately absent — `UpdateSlaPolicyDto` has no such field, so offering it would be a control the server silently ignores. |
| business-hours **day checkbox** | `PATCH /business-hours/:id` | Read-modify-write of `weeklyJson`; the tick is bound to server state, so a failed write visibly snaps back. Re-enabling a day reuses that week's own window rather than inventing 09:00–17:00. |
| **holiday + add** | `PATCH /business-hours/:id` | Chips render real `holidaysJson` — they were hardcoded "25 dec · christmas". A remove ✕ was added so an added holiday is not a one-way door. |
| canned **new response** / **edit** | `POST` / `PATCH /canned-responses` | |
| tags **edit** | `PATCH /tags/:id` | The table row's id is the tag *key*; the route wants the uuid, so the panel reads the raw rows. Pinned by a test. |
| **+ new tag** | `POST /tags` | |
| webhooks **add endpoint** | `POST /webhooks` | Event names are checkboxes of the six the DTO accepts, so a 400 is not reachable by typo. |
| email **support address** | `PUT /email/inbound-address` | See the §1 row — this is the inbound channel's on/off switch, and the field was pretending to save it. |

**Removed (6).** Each because there is no endpoint behind it, so wiring was not an option and leaving it was a lie.

| Control | Why it is gone |
|---|---|
| sla **save policy** / **cancel** (inline card) | The whole "new policy" card was inputs nothing read plus two toast-only buttons. Deleted; `POST /sla-policies` above is the real path. |
| email **reply-to name** | No endpoint — `email.controller.ts` exposes only the inbound address. |
| **in-app widget → manage** | No endpoint. |
| **HashCare bridge → manage** | No endpoint, and `hashcare` is demo fiction — the adapter already notes it "was a fictional customer… not a channel anybody has". |
| **public api → manage** | No endpoint; the api keys panel is where the public api is actually controlled, and the panel now says so. |

**Two things this did not fix, recorded so they are not mistaken for done:**

- **`V.mock` still has three live call sites outside the settings screen**, all still announcing outcomes that did not happen: `screens/Account.jsx:84` (a settings toggle), `screens/EdgeScreens.jsx:44` ("we've told the team"), `screens/Ticket.jsx:380` ("article added to your reply"). `mock`/`askMock` are therefore still defined and exported.
- **`Console.SETTINGS_CARDS` still carries invented meta strings** — "8 people · 2 teams", "3 endpoints · 1 failing", "3 connected" — on the settings overview. Static text rather than controls, but the panels behind them now load live rows, so the overview will visibly disagree with the tables.

### 3.3 No invitation has ever touched a real database

**Status: UNRUN, everything.** The unit specs are green and every one of them builds a fake Prisma client (`invitations.service.spec.ts:70-120`). `grep -rln "invitation" backend/test/` returns nothing.

The riskiest single line is the accept flow's dependence on `app_resolve_invitation` — a `SECURITY DEFINER` function reached through raw SQL (`invitations.service.ts:555-569`) on a connection with **no workspace bound**. If the grant at `migration.sql:237` didn't take, or the column aliases don't match the TypeScript interface at `:46-59`, **every invitation link in the world reports "not valid."**

Second risk: the bind-then-write ordering (`invitations.service.ts:437` before `:476` and `:490`). The spec asserts *call order* only. If `app_set_workspace` or the RLS `WITH CHECK` behaves differently than the mock, every accept 500s **after burning the token** — the invitee cannot retry.

> **What breaks:** your first tester's first impression, and the token is spent.
>
> **Smallest test:** send one invitation to a throwaway address tonight and accept it in a private window. Five minutes. This de-risks more of the week than anything else on this list.

### 3.4 The password reset is unproven past the point the link opens

**Status: UNRUN.** You confirmed the email arrives and the link opens. Nothing has confirmed that submitting the form changes the password, burns the token, or revokes sessions. The spec at `auth.service.password-recovery.spec.ts:110-115` asserts `$transaction` **was called** — its `$transaction` is `jest.fn().mockResolvedValue([])`. Green means the branch was taken. Nothing more.

Three specific holes:

**(a) Reloading the reset page falsely blames the link.** `reset-password/page.jsx:83-90` reads the token then strips it with `replaceState`. Reload, restore a tab, or press back → no token → `phase: 'dead'` → the copy at `:247` reads *"reset links are good for an hour and can only be used once — this one is past that, or has already been used."* **That is false.** The link is fine; the page threw it away. The tester will request another link and hit the same wall.

**(b) A disabled or removed account can complete a reset.** `resetPassword` (`auth.service.ts:594-631`) checks the token, expiry, `usedAt` and `pmUserId` — but **not `isActive`, and not membership**. And the fanout processor's `password_reset` branch (`backend/src/worker-jobs/processors.ts:472-484`) does not filter `isActive` either, unlike the generic branch at `:510-511`. So a removed person gets the email, sets a new password, sees *"That's done ✿ … sign in whenever you're ready"* — then gets `incorrect email or password` forever. Three screens of success followed by a lie.

**(c) "It's on its way ✿" is shown unconditionally.** `Console.jsx:61-65` calls `forgotPassword(...).catch(() => {})` and **synchronously** switches screens without awaiting. The identical confirmation appears for success, a malformed address rejected 400, a 429 from the 5/60s limit, and a completely dead backend. Six clicks of "Send it again" (`Login.jsx:270-272`) guarantees the 429 case.

> **Smallest test:** reset your own password once, end to end. Then confirm the old password fails and your other browser was signed out. Two minutes, kills the biggest unknown in this feature.

### 3.5 The new PM front door and the binding cookie have never been touched by a browser

**Status: UNRUN.** Your successful PM sign-ins ran on the code *before* `e3ee0d6`. What that commit added is exactly three things: the `/signin/redirect` hop, the binding cookie, and the cookie comparison. Everything behind them is EXECUTED; the door in front of them is not.

The test (`auth.pm-signin-binding.spec.ts:24`) constructs `new PmIdentityService({} as never, {…})` — Prisma is literally `{}`. It tests four pure string functions. It proves the cookie *string* has the right attributes. It proves nothing about whether:

- `reply.header('set-cookie', …)` at `pm-identity.module.ts:197` reaches the browser at all — the code notes at `:262` that `@fastify/cookie` is **not a dependency** and the header is hand-written;
- the browser stores it given `Path=/api/v1/auth/pm`;
- it survives PM's redirect chain back to `/callback`;
- the second `set-cookie` at `:302` coexists with the first.

**The failure mode is silent in both directions.** If the cookie is never stored, **every PM sign-in fails** with *"this sign-in did not start in this browser"* — a message that reads like a bug and is unactionable. If it is never *checked*, the fixation hole is still open and nothing reports it.

Related, same flow: the cookie `Max-Age` is 600s and the state row TTL is 10 minutes, set at the same moment (`pm-identity.service.ts:54`, `:211`), so the cookie always dies first. **An expired sign-in therefore reports "did not start in this browser"** rather than "expired."

> **What breaks:** your headline sign-in path, completely, for everyone.
>
> **Smallest test:** one PM sign-in in a clean browser profile. Two minutes. Then repeat once in Safari — ITP should not block a first-party `Set-Cookie` on a top-level navigation, but "should" is the entire problem.

### 3.6 PM sign-in calls `/auth/me` without naming a workspace

**Status: UNRUN.** Verified: `adapter.js:125` stores `{ …, workspace: null }` and *then* calls `/auth/me`. `client.js:109` only attaches the slug header when `session.workspace.slug` exists. So `/auth/me` arrives unnamed → `resolveForUser(userId, undefined)` → for a user with two memberships, 403 → `adoptPmSession` rejects → `Console.jsx:132` shows "plumo sign-in failed" and the user is bounced to the login screen **holding valid tokens**.

Same root cause as §3.1, different door. Whether it fires today depends on `WORKSPACE_DEFAULT_SLUG` — see §6.

### 3.7 The Settings "connect Plumo" link flow is broken two independent ways

**Status: UNRUN.** Both defects are short chains I verified link by link, but neither has executed — treat them as high-confidence reading, not observation.

**(a) The audit write happens on an unbound connection and will throw.** `PmLinkService.apply` commits its transaction at `pm-identity.module.ts:92`, then calls `this.audit.write(...)` at **`:94-100` — outside it.** The callback is `@Public()` (`:231`), so `req.principal` is undefined and `WorkspaceBindingInterceptor` returns without opening a transaction (`workspace-binding.interceptor.ts:58-61`). `audit_log.workspace_id` is `NOT NULL DEFAULT app_current_workspace()`, and `app_current_workspace()` returns NULL when unbound. → **23502 not-null violation**, caught at `:325-329` → the user is told the link **failed**. But it already committed at `:92`: `pm_user_id` is set, and `/auth/pm/status` will then say `linked: true`.

This is the exact trap the invitations module (written tonight) documents and avoids at `invitations.service.ts:538-549`. `PmLinkService` predates it and never got the same treatment.

**(b) It redirects to a route that does not exist.** `pm-identity.module.ts:261` sends the browser to `${consoleUrl}/settings?…`. Verified — the Next app has exactly four routes:

```
frontend/app/page.jsx
frontend/app/layout.jsx
frontend/app/reset-password/page.jsx
frontend/app/accept-invite/page.jsx
```

There is no `/settings`, and `next.config.mjs` is empty. Success, cancellation and failure all land on a 404. (The *sign-in* redirects go to `${consoleUrl}/?…` and `${consoleUrl}/#…` and are fine.)

**(c) And the advice that sends people here is itself a dead end.** When PM sign-in hits an email collision, the message says *"Sign in with your password once and connect Plumo from Settings."* But `GET /auth/pm/start` is `@Roles('admin')` (`pm-identity.module.ts:142-143`) while the Settings button renders on `V.pmAvailable` alone (`Settings.jsx:55-77`). A lead sees the button, clicks it, and gets `Insufficient role`. Separately, that message is **153 characters** and `pm-identity.module.ts:328` does `.slice(0, 120)`, so it arrives truncated mid-word.

> **What breaks:** the documented remedy for the most likely PM failure. **Smallest test:** click "connect plumo" in Settings as your admin account and watch where the browser lands.

### 3.8 Everything the CI integration job would have proven

**Status: UNRUN.** I verified the structural blocker myself. `.github/workflows/backend-ci.yml` creates a **fresh empty** `plumo_cs_test` database, provisions the split roles, then runs `prisma migrate deploy`. And:

```sql
-- backend/prisma/migrations/20260802000000_workspace_tenancy/migration.sql:62-64
IF NOT EXISTS (SELECT 1 FROM users) THEN
  RAISE EXCEPTION 'tenancy: no users — the bootstrap membership would have nobody to point at.';
```

There is no seed step before it. **A fresh CI database has no users, so this migration is structurally incapable of running there.** The tenancy migration was written as an in-place cutover for a database that already had data. `Apply migrations` fails, and `Integration tests` never starts.

That means these are UNRUN, not proven:
- `test/integration/workspace-isolation.integration.spec.ts` — isolation between `dar-blockchain` and `firas2workspace`
- `test/integration/db-roles.integration.spec.ts` — the split-role invariants
- `test/integration/team-scope.integration.spec.ts` — row-level team visibility

The workflow's own header says the integration job exists "so a broken policy fails here instead of in front of a customer." **It has never done that job.** If you hand-ran these locally against a database that had users, that counts and I cannot see it — but CI has not.

> **What breaks:** if you fix a bug during test week, you have no automated way to know you didn't break isolation between the two live workspaces.
>
> **Smallest fix:** insert a minimal user before `prisma migrate deploy` in the integration job, or make that guard conditional on the database being non-empty. Half a day, and it is the only item here that stops this list from getting longer.

#### [08-07] The diagnosis was right, the fix is in, and the migration chain has now been executed end to end

**What was done.** `migrate deploy` has no `--to`, and `users` does not exist before the second migration, so there is no way to get a row in between two migrations except to split the deploy. The integration job now moves every directory `>= 20260802000000_workspace_tenancy` aside, deploys the 6 that precede it, inserts one user, restores the other 10 and deploys them. **No guard was weakened.** The cutover's refusal to adopt nobody is correct — a cutover that adopts nobody has locked every human out of the instance — so CI reproduces the precondition instead of removing it.

Three details in that step are load-bearing and easy to lose in a later edit: `role = 'admin'`, because section 5 copies `users.role` onto the membership and assertion (13) fails the whole file without an active admin; `updated_at` passed explicitly, because its `DEFAULT now()` is added by section 1 of the very migration being prepared for (confirmed against the `init` DDL — it is the one column that is `NOT NULL` with no default); and a new **"every migration on disk is applied"** step counted from `_prisma_migrations`, because a directory moved aside and never moved back would apply nothing, report success, and leave the specs asserting against a half-migrated schema. That is a green run proving nothing, which is the exact failure this job exists to prevent.

**What was verified, and how.** Not in CI — on a throwaway PostgreSQL **17.2** cluster created for this purpose, on a spare port, touching no existing database. Split roles from `prisma/sql/roles.sql`, then the two-pass recipe run by hand exactly as the workflow writes it:

| Step | Result |
|---|---|
| Split at the cutover | 6 before / 10 after, 16 total |
| Pass 1 — up to the cutover | applied, exit 0 |
| Seat the user | `INSERT 0 1` |
| Pass 2 — cutover and after | **applied, exit 0 — the step that had never once succeeded** |
| "Every migration on disk is applied" | `16 of 16` |
| Bootstrap state the cutover derived | one `dar-blockchain` membership, `role=admin`, `is_active=t`; one user with `is_platform_admin=t` — i.e. assertion (13) satisfied by observation, not by reading |

Two incidental claims held up under execution: libpq really does reject Prisma's `?schema=` query parameter, so the `${VAR%%\?*}` strip in both psql calls is required rather than defensive; and `roles.sql` really must run before the migrations, since the cutover onward `GRANT`s to `plumo_app` by name.

**Then the specs ran — for the first time ever — and four of them fail.** 7 suites, 75 tests, **71 passed, 4 failed**. This is precisely the thing the fix's author flagged as unknown: unblocking the step that always failed does not prove the seven spec files pass, and if it broke it would break somewhere no run had ever reached. It did.

| Suite | Result |
|---|---|
| `workspace-isolation.integration.spec.ts` | **PASS** — including the four new invitation cases |
| `team-scope.integration.spec.ts` | **PASS** |
| `sweep-and-facets.integration.spec.ts` | **PASS** |
| `db-roles.integration.spec.ts` | **FAIL** — 1 case. **A real gap. See §3.15.** |
| `cursor-pagination.integration.spec.ts` | **FAIL** — 1 case. Stale assertion, behaviour correct. |
| `transaction-routing.integration.spec.ts` | **FAIL** — 1 case. Stale assertion, behaviour correct. |
| `chat-ingest.integration.spec.ts` | **FAIL** — 1 case. Stale assertion, behaviour correct and unit-pinned. |

The three stale ones are all the same story — assertions written before the tenancy cutover, never re-run because the job died earlier, now describing a world that no longer exists:

- **`cursor-pagination`** asserts the index `tickets_updated_at_id_idx`. The cutover deliberately dropped it and created `tickets_workspace_id_updated_at_id_idx` — a tenant-scoped cursor index, which is the correct shape. Confirmed present in the live catalogue. **[2026-08-08] Fixed** — the test now asserts the new name *and* the column order, since a name-only check would still pass for an index rebuilt in an order that serves neither the tenant predicate nor the cursor tiebreaker.
- **`transaction-routing`** asserts an unbound tenant write fails with `/null constraint|workspace/i`. It **does** fail closed — that is the property under test — but with `42501, new row violates row-level security policy for table "teams"`. RLS refuses it now, which is better than the null-constraint refusal the test was written against. Only the expected wording is wrong.
- **`chat-ingest`** asserts the updates cursor lags the present by more than a second. But `nextUpdatesCursor` floors the cursor at `since`, so a client polling faster than the 30-second lag window gets `cursor === since` — intentional, documented, and **pinned by the unit spec** at `src/chat/updates-cursor.spec.ts` ("clamps the cursor back to `since` … pinned"). The integration assertion contradicts the unit contract; the integration one is the wrong one.

> **What this licenses, precisely.** Tenant isolation between two desks is now proven by something that has executed — that is real and it is the first time it has been true. **It is not proven by CI.** The workflow YAML has never been run by GitHub Actions; I reproduced its steps by hand in bash. The runner uses PostgreSQL 18 and this ran on 17.2. And the job as a whole will still go **red** on the next push to `main` that touches `backend/`, now failing at `Integration tests` instead of at `Apply migrations` — four steps later, with one genuine finding and three stale assertions between it and green.
>
> **[08-08] The 17.2-vs-18 line above is not a generic version-skew hedge — it names a bug class the rehearsal is structurally blind to.** PostgreSQL 18 gives NOT NULL constraints full `pg_constraint` rows (`contype 'n'`) and therefore real names; before 18 they lived only in `pg_attribute`. So a rename migration that hand-lists constraints instead of looping the catalogue **passes on 17.2 and fails on 18** — which is exactly how `20260808120000_rename_organizations_to_companies` went red in CI after a clean local run. Rehearsing on 17.2 cannot reproduce it. CI runs `postgres:18` (`backend-ci.yml:88`) and so does production; a rehearsal cluster that does not is a weaker oracle than it looks, and for this class of change it is no oracle at all.
>
> (That migration's own header states the boundary as "FROM POSTGRESQL 17 ONWARD". Wrong — the catalog patch was reverted from 17 and shipped in 18. It stays uncorrected because the migration is applied and Prisma checksums applied migrations, so editing the file would fail `migrate deploy` on every database that already ran it. `20260808130000` carries the correction.)
>
> **Smallest remaining work:** three one-line assertion updates, then a decision on §3.15. None of it is in the migration or the workflow.

### 3.15 [08-07] `pm_oauth_states` has a `workspace_id` and no row-level security

> **[08-08] RESOLVED — by renaming the column, not by policing it.** `20260808130000_pm_oauth_state_link_workspace_id` renames `pm_oauth_states.workspace_id` to **`link_workspace_id`** (catalog-only `ALTER TABLE … RENAME COLUMN`; the FK, its name and every other object on the table are renamed by a catalogue loop and asserted afterwards). The decision below was framed as "add a policy **or** narrow the test's rule". Both were wrong in the same way: the column was never a tenant key, so one answer breaks sign-in and the other writes an exemption into a test. `link_workspace_id` is what the value has always been — a hint carried across the redirect, naming the desk to map **if** this flow comes back as a link, NULL when it is a sign-in. With it renamed, "has a `workspace_id` column" means exactly "is tenant data" again, the invariant holds with **nothing subtracted**, and `RLS_EXEMPT_TABLES` is deleted rather than emptied. The reason RLS must stay off is not lost with it: `db-roles.integration.spec.ts` now asserts the *absence* of a policy on `pm_oauth_states` alongside `users`, `refresh_tokens`, `password_resets` and `workspaces`, and asserts the table carries `link_workspace_id` and no `workspace_id`. The migration ends with the schema-wide check `organization-vs-workspace.md` asked for, so a future table cannot escape at apply time either.

**Status: EXECUTED — this is a finding, not a prediction.** `db-roles.integration.spec.ts` asks the catalogue for every `public` table carrying a `workspace_id` column whose RLS is off or which has no policy, and expects an empty list. It returns one row:

```
table: pm_oauth_states   rlsEnabled: false   policies: 0
```

The mechanism is the trap the readiness plan already wrote down for invitations: the policy set was derived **once**, at `20260806140000_row_level_security`, over "every public table with a `workspace_id` column". `pm_oauth_states` gained its `workspace_id` afterwards, in the PM OAuth migrations (`20260807020000` / `20260807030000`), so it was never in scope and nothing since has revisited it. A table added later gets no policy automatically — stated in the plan as a risk for a table that did not exist yet, and true meanwhile of one that did.

**How much it matters, stated carefully.** Less than the bare finding suggests, and not nothing. The column is **nullable** here, unlike every real tenant table where `workspace_id` is `NOT NULL` — this is an OAuth CSRF/PKCE state row, addressed by an unguessable single-use `state` secret, not enumerated by tenant. So there is no cross-tenant *read path through the product*. What is true is that `plumo_app` can `SELECT` every pending row in the table, including other desks' `code_verifier` values, and that reaching that requires SQL access rather than an API call.

> ~~**The decision is not mine to make and I have not made it.** It is genuinely two-sided: add a policy, or narrow the test's rule so it exempts non-tenant tables with a nullable `workspace_id` and say why in the exemption.~~ Getting it wrong in the first direction is worse than the gap — this table is read on the OAuth callback on a connection with no workspace bound, so the obvious policy would refuse every sign-in, which is exactly the failure `password_resets` was deliberately excluded to avoid. ~~**No migration was written for this.**~~ **[08-08] Decided, and it was a third option: rename the column.** Neither branch above was right, because both accepted the premise that a table with a `workspace_id` had to be reasoned about. It did not have a tenant; it had a badly named hint. See the note at the head of this section — `20260808130000_pm_oauth_state_link_workspace_id`. `password_resets` remains the precedent for *why RLS stays off*, and that is now asserted rather than merely written down.

### 3.9 Two concurrent refreshes with the same token both succeed

**Status: UNRUN. Verified in source.**

```ts
// backend/src/auth/auth.service.ts:454-460
const row = await this.prisma.refreshToken.findFirst({
  where: { id: payload.jti, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
});
if (!row || row.tokenHash !== sha256(refreshToken)) throw new UnauthorizedException(...);
await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
```

The read filters on `revokedAt: null`; the revoke is `update({ where: { id } })` — **not conditional on `revokedAt` still being null**. Two requests can both pass the check and both receive fresh pairs. Two open tabs make this reachable.

### 3.10 Two open tabs kill each other's session

**Status: UNRUN.** `client.js` keeps `session` in a module-level variable, and there is no `storage` listener and no `BroadcastChannel` anywhere in `frontend/lib`, `components` or `app`. Tab A refreshes → the old token is revoked → Tab B still holds it → Tab B's refresh 401s → Tab B calls `setSession(null)`, which clears the **shared** localStorage entry → Tab A dies on its next load. Both tabs land on the sign-in screen for no visible reason. Very plausible during a test week; testers open tabs.

### 3.11 Change-password logs you out fifteen minutes later, contradicting its own message

**Status: UNRUN.** Verified in source — `auth.service.ts:645-648` is `updateMany({ where: { userId, revokedAt: null } })`, with **no exclusion for the caller's own jti**. The comment directly above it at `:644` says *"the caller keeps its access token until expiry"* (true) and the toast at `Console.jsx:90` says *"password changed — you're still signed in ✿"*. But the caller's **refresh** token is revoked too. Real sequence: change password → keep working → ~15 minutes later a 401 → refresh fails → dumped to the sign-in screen with **no message**, losing any in-progress reply draft.

Also on that screen: `Account.jsx:62-70` shows the password card to **everyone**, including PM-provisioned accounts whose `passwordHash` is argon2 over 32 random bytes. They cannot know their "current" password and will be told it is wrong, with no explanation that they never had one.

### 3.12 Invitation tokens go into your logs in plaintext

**Status: UNRUN as an observed leak; verified as a code shape.** The token is a URL **path segment** (`invitations.controller.ts:60`, `:68`), and the pino redact list is exactly:

```js
// backend/src/app.module.ts:56
redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
```

`req.url` is not redacted and pino-http's default request serializer includes it. So every invitation lookup writes a live token into the application log, and nginx logs the same request line. For a *new* invitee that token is enough to create an account with a password of the attacker's choosing on that desk (`invitations.service.ts:426-430`).

Contrast: the password reset token is handled correctly — it travels in the **body** of `POST /auth/reset-password` and never appears in a URL the API sees.

Mitigating: 7-day TTL, single use, invalidated the moment the real invitee accepts. Not mitigating: the window between "email sent" and "tester gets round to it" is exactly test week.

> **Smallest fix:** add `req.url` handling to the redact config, or move the token to the body. Either is minutes.

### 3.13 Login response timing reveals whether an account exists

**Status: UNRUN — this is a code-shape inference, I have not measured it.**

```ts
// auth.service.ts:122-125
const user = await this.prisma.user.findUnique({ where: { email } });
if (!user || !user.isActive) throw new UnauthorizedException(...);   // returns after one indexed SELECT
const ok = await argon2.verify(user.passwordHash, password)...       // ~100ms, deliberately slow
```

Both branches return the same string, which is why this looks safe on inspection. The clock says which is which.

> **Smallest test:** `curl -w %{time_total}` against a known and an unknown address. Two minutes, and it tells you whether to care. Fix if you do: hash a dummy value in the not-found branch.

### 3.14 Smaller UNRUN items, listed for completeness

- **The `forgot-password` enqueue failure is swallowed** (`queue.producer.ts:56-63`). If Redis or the worker is down, the endpoint still answers 200 and nothing is sent.
- **Invitation email is sent *inside* the request's Postgres transaction** (`invitations.service.ts:184-192`) which has a 15-second timeout (`configuration.ts:34`), while nodemailer's default connection timeout is 2 minutes. A merely *slow* relay blows the transaction first: the invitation rolls back, the mail may still go out, the admin gets a 500 and the invitee gets a link that says "not valid." **Cheap interim fix: set `connectionTimeout`/`greetingTimeout`/`socketTimeout` on the transport to under 15s** so the intended failure mode is the one you actually get.
- **Two admins inviting the same address at once** → both insert → one hits `invitations_pending_email_key` → Prisma P2002 is unmapped in `http-exception.filter.ts` → **unexplained 500**. Correct outcome, terrible message.
- **Admin revokes while someone is mid-accept.** If revoke wins, the accepter is told *"This invitation has just been used. Sign in with your email address instead"* (`invitations.service.ts:448-452`) — wrong on both counts. If accept wins, `revoke()` writes the `invitation.revoked` audit row **unconditionally** even though `updateMany` matched 0 rows (`:273-283`): the trail says revoked, the person is a full member.
- **`pruneExpiredStates()` is dead code.** Grep confirms `pm-identity.service.ts:405` is its only occurrence. Nothing schedules it. `/auth/pm/signin/redirect` is `@Public` with no `@Throttle`, so it is an unauthenticated row-insert endpoint at 120/min/IP. Disk growth, not correctness — a three-months-from-now problem.
- **The throttler store is in-memory and per-process.** No `storage` configured (`app.module.ts:60-70`). Every deploy resets every counter, and any `--scale` above 1 silently multiplies every limit.
- **Nothing ever deletes spent `password_resets` rows**, and `forgotPassword` creates a new one per request without invalidating earlier ones — five requests means five live single-use tokens for an hour.
- **`ttlToMs` fails soft.** `auth.service.ts:14-19` accepts only `^(\d+)([smhd])$` and returns **15 minutes** for anything else. `JWT_REFRESH_TTL=1w` or `30 d` in production would mean the JWT claims 30 days while the DB row expires in 15 minutes — every session dying quarter-hourly with no error anywhere.

---

## 4. UNDEFINED — questions only you can answer

Framed as decisions, with my recommendation.

**Q1. What should the console do when login returns "name your workspace"?**
There is no picker, no `/auth/workspaces` endpoint, nothing. Today it renders "incorrect email or password."
→ *Recommendation for this week: sidestep it — put every tester on exactly one desk. Then build the picker. Interim one-liner: make `Login.jsx:141-149` render the server's message instead of a literal, the way the PM path already does at `:127-131`. The plumbing exists.*

**Q2. Should a demoted, deleted or disabled PM user lose their CS session — and when?**
Today: **never.** `refresh()` asks PM nothing (`auth.service.ts:445-468`), the CS membership created by `ensureDeskMembership` is never revoked, and each rotation mints a fresh 30 days. There is no webhook receiver, no worker job, no back-channel of any kind. A deleted PM account is discovered only when that person next clicks Continue with Plumo — which may be never.
→ *Recommendation: accept it for a trusted-tester week; write it down as a known limit. For real customers you need either a PM webhook or a periodic re-check.*

**Q3. Should a disabled or de-membered account be able to complete a password reset?**
Today it can (§3.4b) and then cannot log in.
→ *Recommendation: add the `isActive` check to `resetPassword` and to the `password_reset` fanout branch. Two lines, and it removes a three-screens-of-success-then-a-lie path.*

**Q4. Is there any protection against removing the last admin?**
No. `users.module.ts:133-157` writes `role` straight to the membership with no last-admin and no self-demotion check; `:168-177` deactivates with no self-check. `AuthGuard` re-reads role per request, so both take effect on the very next request. **A desk with zero admins cannot be repaired through the product** — and PM sign-in does not rescue it, because `ensureDeskMembership` is create-if-missing and never re-promotes (`auth.service.ts:423-441`).
→ *Recommendation: add a last-admin guard before testers arrive. It is a small query and the failure it prevents needs database access to undo.*

**Q5. Should API keys expire, and what happens when their creator leaves?**
Today: they never expire (no `expiresAt` on the DTO, no update endpoint, and `ValidationPipe({whitelist:true})` strips it if sent), and deactivating the creator does nothing — `app_resolve_api_key` never joins `users`. The key outlives the person and any memory of why it exists.
→ *Recommendation: add `expiresAt` to the create DTO. The column and the guard branch already exist; this is genuinely a few lines.*

**Q6. Should the console default to an instance-wide API key?**
Today it does, silently. `adapter.js:732-737`: `boundTo = teamId === undefined ? currentUser?.teamId ?? null : teamId`, then `...(boundTo ? { teamId: boundTo } : { allowInstanceWide: true })`. **A team-less admin — which is exactly what desk provisioning creates — mints an instance-wide, never-expiring, all-tickets key by clicking the default button.** The backend's deliberate "ask for it explicitly" guard is satisfied automatically by the client. The adapter's own comment at `:722-725` says this should be a deliberate toggle. It is not.
→ *Recommendation: flip the default. Omitting `allowInstanceWide` should fail loudly rather than grant everything.*

**Q7. Should a revoked refresh token being replayed kill the whole family?**
Today, no — `auth.service.ts:457-459` throws and stops. Rotation without reuse detection is rotation that doesn't help: an attacker who lifts a token can rotate it for 30 days, and the legitimate user rotating theirs does nothing to stop it.
→ *Recommendation: not urgent for trusted testers. It is roughly six lines at `:457`. Put it on the list before real customers.*

**Q8. Should the link callback be browser-bound like the sign-in callback is?**
The cookie check is gated on `isSignIn` (`pm-identity.module.ts:282`). A link callback is authenticated only by the state row. An authenticated admin could start a link and get a victim to open the callback URL, writing the *victim's* PM `sub` onto the *attacker's* CS row. The comment at `:274-278` argues the row is sufficient — that argument holds for "cannot move a session" but not for "cannot capture someone else's identity."
→ *Recommendation: low priority (requires an authenticated admin attacker), but bind it when you touch §3.7.*

**Q9. Should unlinking strand a PM-provisioned account?**
After unlink, `pm_user_id` is NULL, so `forgotPassword` will happily mint a reset token for an account whose password was random bytes — producing a permanent password on a desk PM can never revoke. Two clicks, no guard.

**Q10. What happens to pending invitations when a workspace is suspended?**
Nothing revokes or expires them. Links refuse while suspended and **silently start working again** if the desk is reactivated, up to the 7-day expiry. The admin cannot revoke them in the meantime, because they cannot sign in.

**Q11. Which desk should a PM admin of several orgs land on?**
`auth.service.ts:188` picks `desks[0]`, ordered by slug (`:172-176`). Alphabetical. Nobody decided that is right, and there is no switcher.

**Q12. Should a refused sign-in leave a trail?**
It does not. `loginWithPm` writes no audit row on any refusal path. `IdentityAuditLog` exists in the schema (`prisma/schema.prisma:620-635`) with **zero references anywhere in `src/`**. A tester who is refused this week leaves no record you can look up.
→ *Recommendation: worth an hour before testers arrive purely for your own debugging.*

**Q13. What should a PM id that is not Mongo-shaped do?**
`desk-${id.slice(-8)}` is only guaranteed valid because a Mongo ObjectId tail is `[0-9a-f]{8}`. A PM id with an uppercase letter or `_` in its last 8 characters violates `workspaces_slug_format`, which raises **23514, not 23505** — so `provisionDesk`'s retry loop (`auth.service.ts:290-292`) rethrows and the sign-in 500s.

---

## 5. WHAT AN ALREADY-ISSUED TOKEN STILL GRANTS

Blunt version, because this is the thing owners are always surprised by.

**There is no token version, no jti allow-list, and no revocation check in `AuthGuard`. An access token is unconditionally valid for its full TTL — 15 minutes by default. Nothing can shorten that. Not logout, not a password change, not disabling the account.**

I verified `auth.guard.ts:28-84` does exactly two things: verify the JWT signature and expiry (`:51-53`), and re-resolve the membership from the database (`:69-72`). It performs **no read of the `users` table at all.**

### How long revoked authority keeps working

| Authority removed | Keeps working for | Why |
|---|---|---|
| **Membership deactivated** (`workspace_memberships.is_active = false`) | **0 seconds** — next request | `auth.guard.ts:69` → `workspace-context.service.ts:141-143` → 403 |
| **Workspace suspended** | **0 seconds** | `app_resolve_membership` filters `w.status = 'active'` → no row → 403 |
| **User globally disabled** (`users.is_active = false`) | **the full access TTL — 15 min** | `AuthGuard` never reads `users`. Only `login()` and `refresh()` check it, and refresh is only reached once the access token already died |
| **PM role revoked / PM account deleted** | **up to the full refresh TTL — 30 days, renewing** | Checked on PM sign-in only. `AuthGuard` and `refresh()` check neither, and cannot — CS has no way to ask PM about a `sub` without that person's token |

### What each action actually revokes

| Action | Refresh tokens | Access tokens |
|---|---|---|
| Change password | **all revoked, including the caller's own** (`auth.service.ts:645-648`) | **nothing** |
| Reset password | all revoked (`:625-628`) | **nothing** |
| Logout | **only the one presented** (`:475-478`) | **nothing** |
| `DELETE /users/:id` | all revoked (`users.module.ts:174`) | **nothing** |
| `PATCH /users/:id {isActive:false}` | **not revoked** — session survives until natural expiry | **nothing** |
| Revoke an API key | n/a — takes effect **immediately** (`app_resolve_api_key` filters `is_active`) | n/a |

**Two consequences worth stating plainly:**

1. **There is no "sign out everywhere."** Logging out on one device leaves every other device working for the full 30 days. No feature, no endpoint, no decision recorded.
2. **The reset page overstates what it did.** `reset-password/page.jsx:230` says *"every other session has been signed out."* Only refresh tokens were revoked. Another device stays fully usable for up to the access TTL.

The one genuinely good property here: because `AuthGuard` re-resolves membership on every request, **removing someone from a desk is instant.** That is the fastest lever you have — and it is the one the console cannot pull (§3.2).

---

## 6. RANKED RISK FOR THE TEST WEEK

Ordered by how likely it is to actually bite.

**1. The first invitation you send returns 500, or the link says "not valid."**
Not because the logic is wrong — because `app_resolve_invitation` has never been called against a real database, the SMTP send has never run inline, and no CI job has ever touched either (§3.3, §3.8).
→ **Mitigation: send one invitation to a throwaway address tonight and accept it. Five minutes.** This is the highest-value five minutes available to you.

**2. A tester ends up on two desks and is permanently locked out.**
Fifteen minutes in they are logged out, and the screen tells them their password is wrong (§3.1).
→ ~~**Mitigation this week: put every tester on exactly one workspace. Do not invite anyone to both.** Real fix afterwards: send `x-workspace-slug` on login and refresh, plus a picker.~~
→ **[08-07] The real fix landed for refresh, and the screen no longer lies. Keep the mitigation anyway, for this week.** The refresh now names its desk and the 403 is no longer reached (§3.1), but *this has never been exercised by a browser holding a two-membership session across a token expiry* — which is the only observation that would settle it, and it takes 20 minutes of waiting. **What has not been built is the picker**: there is still no `GET /workspaces/mine` and no way for a two-desk user to reach their *other* desk. They are pinned to whichever desk their session started on. So "one tester, one desk" remains the right rule for the week — no longer because the alternative is a lockout, but because the alternative is a desk they cannot get to.

**3. "Continue with Plumo" refuses everyone with "this sign-in did not start in this browser."**
The binding cookie has never been stored or read by a real browser, and it is hand-written without `@fastify/cookie` (§3.5).
→ **Mitigation: one PM sign-in in a clean browser profile, then one in Safari. Four minutes.**

**4. You need to remove a tester and cannot.**
The console button is a mock; the backend route has no caller (§3.2).
→ ~~**Mitigation: know now that removal is `curl` or SQL. Better: wire the button before Monday — the endpoint already exists and already does the right thing.**~~
→ **[08-07] The button is wired (§3.2). It has still never been clicked against a real server, so press it once on a throwaway account before you need it in anger** — that is the two-minute check that moves this row to EXECUTED, and the failure it would catch (a 403, a wrong id, a role gate) is one you want to find on a Tuesday rather than while removing someone. `curl` remains the fallback.

**5. The password reset half-works.**
The link opens (proven). Whether submitting changes the password, burns the token and kills sessions is unproven (§3.4).
→ **Mitigation: reset your own password once, end to end. Two minutes.**

**6. Someone reloads the reset page and is told, falsely, that their link is expired.**
Then they request another, reload again, and hit the same wall (§3.4a).
→ **Mitigation: know the answer for support — "don't reload, use the link fresh." Fix: keep the token in state without depending on the URL, or soften the copy.**

**7. Someone changes their password and is silently logged out mid-draft ~15 minutes later**, after being told they were still signed in (§3.11).
→ **Mitigation: exclude the caller's jti from the revoke, or change the toast to tell the truth.** Either is one line.

**8. Two open tabs kill each other's session for no visible reason** (§3.10).
→ **Mitigation: none cheap. Know the symptom so you don't chase a ghost when a tester reports it.**

**9. Two admins invite the same person and one gets an unexplained 500.**
P2002 unmapped in `http-exception.filter.ts`. Cosmetic, plausible with two people setting up, trivially fixable.

**10. A slow SMTP relay produces "invitation created, admin saw an error, invitee got a dead link"** (§3.14).
→ **Mitigation: set the nodemailer timeouts under 15s.**

**11. Nothing you learn this week is backed by a test that runs.**
Fix a bug during the week and you have no automated check that you did not break isolation between the two live workspaces (§3.8).
→ ~~**Mitigation: the seed-before-migrate fix. Half a day, and it is the only item that stops this list from growing.**~~
→ **[08-07] Half-true now. The seed-before-migrate fix is written and the isolation spec has been run and passes — but not by CI, and CI is still red.** Isolation between the two desks is genuinely proven by an execution for the first time (§3.8). What you do **not** yet have is the automatic version: the job now fails four steps later, on one real finding (§3.15) and three assertions that were stale before this week. Until those are settled, a push to `main` still gives you a red check rather than a guarantee — and a red check that everyone learns to ignore is worse than the honest failure it replaced. **This is the item most worth finishing before Monday**, and what remains is three one-line edits and one decision, not half a day of migration work.

**12. Invitation tokens sitting in your logs** (§3.12). Low probability of exploitation this week, trivial to fix, and it stops being trivial once you have contractors or a log shipper.

### Three things to check on the server — I cannot see them from the repo

Production env lives at `/opt/plumo-cs/app/.env` (`backend/docker-compose.prod.yml`, `env_file:`).

1. **`WORKSPACE_DEFAULT_SLUG`** — set or unset decides whether §3.1 and §3.6 are a hard lockout or a silent wrong-desk pin. Note that if it *is* set, a two-membership user is quietly pinned to one desk with no way to reach the other. **The fact that you can log in today is itself a data point: either you have only one active membership, or this is set.**
2. **`JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`** — every number in §5 assumes the `15m`/`30d` defaults, and `ttlToMs` silently collapses anything malformed to 15 minutes.
3. **`SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;`** — HEAD is literally *"fix(cd): pending migrations are a report, not a crash."* A green deploy no longer proves the invitations migration ran. Confirm `20260807190000_invitations` is there.

Also unverifiable from here and worth a glance: **SMTP TLS** (`email.service.ts:64-71` sets `secure: false` with no `requireTLS`, so nodemailer will opportunistically STARTTLS but nothing forces it — if your relay doesn't advertise it, every reset and invite link crosses the wire in cleartext), and **whether port 3002 is firewalled** (`main.ts:93` defaults `BIND_ADDRESS` to `0.0.0.0` under `network_mode: host`, against the intent of the comment directly above it).

---

## 7. WHERE THE FOUR PASSES DISAGREED

I re-read the source for each of these. Stating them because two change the plan.

**7.1 — Team-scope and RLS: "EXECUTED in CI" vs "the integration job has never run."**
**[08-07] Resolved by execution, and the pessimist was right about the past while the optimist is now right about the present.** The mechanism below was real: the job could not reach the test step, so citing a CI file as evidence was citing a file rather than a run. That has now been fixed and the specs have been executed (§3.8) — `team-scope` and `workspace-isolation` both pass, and both are marked EXECUTED in §1 on the strength of the run, not the fix. The distinction the disagreement turned on survives intact and is worth keeping: **the existence of a CI file is not its execution**, and it still is not — the workflow itself has never been run by GitHub Actions, and the job would still finish red today.

**The pessimistic reading is right, and I verified the mechanism myself.** The invitations pass cited `team-scope.integration.spec.ts` running "in CI against Postgres 18" as proof that team-scoped row filtering is EXECUTED. But `.github/workflows/backend-ci.yml` builds a fresh empty database and runs `prisma migrate deploy` with no seed step, and `20260802000000_workspace_tenancy/migration.sql:62-64` raises `'tenancy: no users'` on an empty database. The migration cannot succeed there, so the test step cannot start. **The existence of a CI file was mistaken for its execution.** I have downgraded team-scope, workspace-isolation and db-roles to UNRUN in §1.

**7.2 — Why CI fails: two causes claimed, only one is real.**
The adversarial pass gave two blockers: (a) `CREATE EXTENSION` fails because `plumo_migrator` is `NOSUPERUSER`, and (b) the no-users guard. **(a) is wrong.** `prisma/sql/roles.sql:123-133` explicitly grants `CREATE ON DATABASE` to `plumo_migrator`, with a comment saying it exists "so migrations can install trusted extensions (citext, pgcrypto, btree_gin)" — and both are trusted extensions in PG13+, installable by a non-superuser holding that grant. **(b) is confirmed at the source and is sufficient on its own.** Fix the seed, not the grant.

> **[08-07] Both halves of this now rest on execution rather than reading, and both stand.** The whole 16-migration chain applied cleanly on a real cluster as `plumo_migrator` (§3.8), so (a) was indeed a false alarm — the extensions install fine under that grant. And seating exactly one user is sufficient on its own: nothing else was changed, and the cutover went from "structurally incapable" to green. It is worth recording that (b) was *sufficient* as well as necessary, because the tempting cheap fix — weakening the `IF NOT EXISTS (SELECT 1 FROM users)` guard — would have been both unnecessary and wrong.

**7.3 — "Wrong password" status: UNRUN vs "MOCKED-adjacent."**
**UNRUN is correct.** I listed the spec files: `auth.pm-signin-binding`, `auth.service.password-recovery`, `auth.service.pm-login`, `auth.service.provisioning`. **None covers `login()`.** There is no mock asserting it either, so "MOCKED-adjacent" overstates it. You have almost certainly typo'd your own password at some point, but that is not evidence anyone recorded.

**7.4 — "The owner is a member of both desks."**
The PM pass asserted this from `auth.service.ts:371` (provisioning seats the founder). If it were true of *active* memberships, your password login would 403 today — and it does not. So either you hold only one active membership, or `WORKSPACE_DEFAULT_SLUG` is set. **Your working login is evidence, and it is the cheapest way to answer check #1 in §6.**

**7.5 — Invitation throttling.**
Worth stating so nobody double-counts: the public invitation routes **do** carry per-route limits — `@Throttle({limit: 20, ttl: 60_000})` on lookup and `{limit: 10}` on accept (`invitations.controller.ts:58-68`). The "no cap" finding refers only to `POST /invitations` (admin create), which correctly has none. Both readings were right about different routes.

---

## What is genuinely fine

So this document is useful rather than uniformly alarming:

- **Secret storage is correct everywhere.** Nothing is stored in plaintext that shouldn't be, and the PM-provisioned-account trick (argon2 over random bytes rather than a sentinel) is a nice touch that keeps the ordinary verify path valid.
- **Enumeration is closed on every surface except login timing.** Forgot-password, invitation lookup, workspace 403s and OAuth state failures all return one uniform message, each with a comment explaining why.
- **Re-reading authority per request** instead of baking role into the JWT is the right call and is well-argued in the code. It is why membership revocation is instant.
- **The proxy-trust fix is the best-tested thing in the repo** — a real Fastify adapter, real injected requests, the forgery bypass genuinely closed.
- **The concurrency primitives are correct by construction**: `ON CONFLICT` with a repeated partial-index predicate, a conditional single-use claim returning a count, atomic OAuth state consumption. They have never met Postgres, but they are the right shapes.
- **PKCE is implemented properly** — verifier server-side only, never leaves the process.
- **Returning the session in a URL fragment rather than a query string**, and stripping it with `replaceState` before the first `await`, is the correct choice and is done consistently across all three pages that receive a token in a URL.
- **The unit suite and container builds are green and honest about what they cover.** Several spec files carry header comments stating their own limits. That is unusual and it made this document possible.

The gap is not code quality. It is that a large amount of carefully-reasoned code has never been executed even once — and the two features you most need next week (invitations, and the new PM front door) are entirely in that category. **The five checks in §6, done tonight, convert most of this document from UNRUN to EXECUTED.**