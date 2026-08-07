# Manual test script — production, by hand, before testers

**Against:** console `https://cs.plumo.work` · api `https://csapi.plumo.work` · HEAD `12c73b7`
**Time:** ~60 minutes if nothing breaks. **Stop after any group** and you will have learned something whole.
**Supersedes** §6 of `auth-readiness-plan.md`. Every expected result below was read out of the code, not inferred from intent.

Twelve scenarios, in dependency order — later ones reuse accounts and sessions earlier ones create. Do not reorder without reading the **Setup** line.

## Scoreboard

Fill this in as you go.

| # | Scenario | Risk | Result |
|---|---|---|---|
| 1 | Password login + the four distinct errors | BLOCKER | ☐ pass ☐ fail |
| 2 | Continue with Plumo — second PM account | BLOCKER | ☐ pass ☐ fail |
| 3 | Continue with Plumo — email collision on your main account | MAJOR | ☐ pass ☐ fail |
| 4 | Settings → connect plumo | MAJOR | ☐ pass ☐ fail |
| 5 | Continue with Plumo again, now linked | MAJOR | ☐ pass ☐ fail |
| 6 | Create + send an invitation | BLOCKER | ☐ pass ☐ fail |
| 7 | Accept it — new account, sets a password | BLOCKER | ☐ pass ☐ fail |
| 8 | Accept it — address that already has an account | MAJOR | ☐ pass ☐ fail |
| 9 | Revoke, re-invite, and a garbage token | MAJOR | ☐ pass ☐ fail |
| 10 | Dual membership survives a token refresh | MAJOR | ☐ pass ☐ fail |
| 11 | **Deactivate — do they really lose access** | BLOCKER | ☐ pass ☐ fail |
| 12 | Reset password, redeemed to the end | MAJOR | ☐ pass ☐ fail |
| 13 | Change password, and logout | MINOR | ☐ pass ☐ fail |

BLOCKER = you cannot invite testers next week. MAJOR = you can, but you will be firefighting. MINOR = write it down and move on.

---

## Preflight — 60 seconds

**1. Two browser profiles, not two windows.**

| | Purpose |
|---|---|
| **Profile A** | Your daily Chrome, already signed in as `firasbenhiba49@gmail.com` on `dar-blockchain`. This is "you, the admin". |
| **Profile B** | A **new** Chrome profile (⋮ → Profile → Add). This is "the tester". It must have never seen cs.plumo.work — scenario 2 tests a cookie that is written on a first visit. Not incognito: you need localStorage to survive a navigation. |

**2. DevTools open in both, on the Network tab, with "Preserve log" ticked.** Almost every "if it fails" line below wants a request off that tab. Turning it on afterwards means running the scenario twice.

**3. Tabs to have open:** `resend.com/domains`, your Gmail, and a terminal on the box.

**4. Which email situation are you in.** Open `resend.com/domains`:

- **`plumo.work` = Verified → Situation A.** Mail goes anywhere. Everything below is runnable.
- **Not listed, or Pending → Situation B.** Resend delivers **only** to `firasbenhiba49@gmail.com`, `SMTP_FROM` is `onboarding@resend.dev`, and **plus-aliases are a different address to Resend and will be rejected**. Scenario 7 is not runnable; it has a substitute.

Second confirmation, free: the `From:` on the first mail that arrives. `onboarding@resend.dev` = Situation B.

**5. Optional, 20 seconds on the box, and it removes guesswork from scenarios 1 and 10:**

```
docker compose exec api sh -c 'env | grep -E "WORKSPACE_DEFAULT_SLUG|JWT_ACCESS_TTL|SMTP_FROM"'
```

`WORKSPACE_DEFAULT_SLUG` set or unset changes which of two correct messages scenario 11 produces. `JWT_ACCESS_TTL` unset means 15m (`config/configuration.ts:63`).

**6. Pick your lane** — this decides the addresses used from scenario 6 onward.

| | Situation A | Situation B |
|---|---|---|
| The invitee address | any mailbox you control, or `firasbenhiba49+t1@gmail.com` | `firasbenhiba49@gmail.com` (nothing else is delivered) |
| The inviting desk | `dar-blockchain` | `firas2workspace` |
| Who sends the invite | Profile A | Profile B, after scenario 2 |
| Accept it in | Profile B | Profile A |
| So scenario 7 (new account) is | runnable | **not runnable** — see its substitute |
| So scenario 8 (existing account) is | a separate extra invite | the main accept |

---

# Group 1 — Can anyone get in at all

*Stop after this group and you know whether the front door works.*

## 1. Password login, and the four distinct errors · BLOCKER

**Setup** Profile A, signed out (⋮ menu → sign out, or use a fresh tab and clear `plumo.session` from localStorage).

**Steps and expected** — the point of this scenario is the *exact strings*. Four of these five used to be one sentence.

| Type this | Expect exactly |
|---|---|
| a. your real email + real password | you land in the queue |
| b. your real email + a **wrong** password | `incorrect email or password. no harm done — try once more.` |
| c. `nobody-here-2026@example.com` + anything | **byte-identical to (b)** |
| d. your second PM account's address + any password | **also identical to (b)** |
| e. 11 sign-in attempts inside 60 seconds | on the 11th: `too many attempts. wait a moment, then try again.` |

**Proves** (b) and (c) reading identically is deliberate and must not regress — `auth.service.ts:123` and `:125` throw the same 401 for "no such user", "deactivated" and "wrong password", and `Login.jsx:95` is the one string for all of them. (d) proves a PM-provisioned account genuinely cannot password-login: its `passwordHash` is argon2 over 32 random bytes (`auth.service.ts:263`), so verify simply never matches. (e) proves the 10/60s limit at `auth.controller.ts:15` and, more importantly, that the console now *reads* it — the error object survives to the formatter (`Console.jsx:1498` → `Login.jsx:115-136`), which is the step that was broken until yesterday.

**The fifth error — "no access" — is deferred to scenario 11.** No account exists today that has an account but no desk. Trying to fake it here proves nothing.

**If it fails**
- Every failure reads the same → `Console.jsx:1498` is back to `loginError: true`, or the server stopped sending `code`. Check the login response body for `error.code`.
- (e) never fires → the throttler buckets by `req.ip` (`principal-throttler.guard.ts:60-80`); if nginx is not passing a real peer address every request gets its own bucket. Check whether the 11th response is 401 or 429 in Network.
- (b)/(c) differ → **stop and tell me.** That is an account-enumeration oracle, not a cosmetic bug.

> One measurable difference remains and is expected: (c) returns after a single indexed SELECT, (b) after a ~100ms argon2 verify. Text identical, clock not. Not a blocker for a trusted-tester week.

**Result** ☐ pass ☐ fail — notes: ______

*Wait 60 seconds after (e) before continuing — you throttled your own IP, and both profiles share it.*

## 2. Continue with Plumo — the second PM account · BLOCKER

**Setup** **Profile B**, never used. This is the whole point: the binding cookie has never been stored by a real browser.

**Steps**
1. Open `https://cs.plumo.work`. Click **Continue with Plumo**.
2. Watch Network. You should see `GET /auth/pm/signin` (returns a URL), then a **top-level navigation** to `csapi.plumo.work/api/v1/auth/pm/signin/redirect`, then PM, then back.
3. Sign in as the **second PM account** (the one that owns `firas2workspace`, no password).
4. Once inside: DevTools → Application → Local Storage → `plumo.session` → read `workspace.slug`.

**Expect** You land in the console. `workspace.slug` is `firas2workspace` — **unless** that PM account also administers the PM org behind `dar-blockchain`, in which case it is `dar-blockchain`, because the desk is picked as `desks[0]` ordered by slug ascending (`auth.service.ts:172-176`, `:188`). Note which; scenario 6 depends on it.

**Proves** The three things added after your last successful sign-in and never touched by a browser since: the `/signin/redirect` hop, the `Set-Cookie: pm_signin_state` written by hand at `pm-identity.module.ts:197`, and the comparison at `:282-287`. `@fastify/cookie` is not a dependency — that header is assembled as a string (`pm-identity.service.ts:309-323`).

**If it fails**
- `this sign-in did not start in this browser — please try again` → the cookie was never stored or never came back. Application → Cookies → `csapi.plumo.work` → is `pm_signin_state` there? It is `Path=/api/v1/auth/pm`, `HttpOnly`, `SameSite=Lax`, `Secure`. Lax is correct for a top-level GET from PM; Strict would drop it.
- Same message but you took longer than 10 minutes → that is expiry wearing the wrong label. Cookie `Max-Age` is 600s (`pm-identity.service.ts:54`) and the state row TTL is the same, so an expired sign-in always reports as a browser mismatch. Retry promptly and it should pass.
- `You are not an owner or admin of any Plumo workspace` → that PM account is not P0/P1 anywhere (`auth.service.ts:157-162`). Fix it in PM, not here.
- Repeat this scenario once in **Safari** before Monday. ITP should not block a first-party `Set-Cookie` on a top-level navigation, but "should" is the entire risk.

**Result** ☐ pass ☐ fail — notes: ______

## 3. Continue with Plumo — the collision your main account will hit · MAJOR

**Setup** Profile A, signed out. Your main CS account is a password account and is **not** PM-linked.

**Steps** Click **Continue with Plumo**, authenticate as the PM identity whose email is `firasbenhiba49@gmail.com`.

**Expect** Bounced back to the sign-in screen with a red box reading, cut mid-word:

```
A Plumo CS account already uses this email address. Sign in with your password once and connect Plumo from Settings — th
```

**Proves** The refusal at `auth.service.ts:246-254` — a colliding email is refused, never merged, because PM emails are mutable and merging on email is an account-takeover shape. The truncation is `.slice(0, 120)` at `pm-identity.module.ts:328` against a 153-character message. **Also confirm no third desk appeared:** the refusal happens at `:196`, before the provisioning branch at `:216`, so a collision must not create a desk.

**If it fails**
- You end up *signed in* → stop, tell me immediately. That means an email match resolved an account.
- You get `You are not an owner or admin of any Plumo workspace` instead → your main PM identity is not P0/P1 anywhere, so the role gate fired first. The collision is untested; say so and move on, it is still refused.
- A new desk appears in the database → the ordering at `auth.service.ts:196` vs `:216` has moved.

**Result** ☐ pass ☐ fail — notes: ______

---

# Group 2 — The PM link round trip

*Two scenarios. The first is expected to end badly in a specific way; the second is the payoff.*

## 4. Settings → connect plumo · MAJOR · **expect a rough landing**

**Setup** Profile A, signed in with your password as admin on `dar-blockchain`.

**Steps** Settings → the plumo card → **connect plumo** → complete PM consent → follow the browser wherever it goes.

**Expect — read this before you click, so you can tell a near-miss from a failure:**

1. You will very likely land on a **404 at `cs.plumo.work/settings`**. That route does not exist — the Next app has exactly four routes (`app/page.jsx`, `layout.jsx`, `reset-password/`, `accept-invite/`) and `next.config.mjs` is empty, while the callback redirects to `${consoleUrl}/settings?...` (`pm-identity.module.ts:261`).
2. The query string on that 404 is the real result. `?pmLink=ok` means the link worked. `?pmLink=failed&reason=...` is the expected outcome, for a reason that is **not** the link failing.
3. **The link almost certainly applied anyway.** `PmLinkService.apply` commits at `pm-identity.module.ts:92`, then writes the audit row at `:94-100` — outside the transaction, on a `@Public` callback with no principal, so `WorkspaceBindingInterceptor` opened nothing (`workspace-binding.interceptor.ts:58-61`) and `audit_log.workspace_id` has no value to default from (`prisma/schema.prisma:488`, `NOT NULL DEFAULT app_current_workspace()`). That is a 23502, caught at `:325-329`, reported to you as "failed".

**So the real check:** go back to `https://cs.plumo.work` → Settings. If the plumo card now says **disconnect**, the link is in place and only the reporting lied. That is a PASS with a caveat, not a failure.

**Proves** The whole Settings-side link path, which has never executed. Whichever way it goes, you learn something exact.

**If it fails** differently — e.g. `Insufficient role` — `/auth/pm/start` is `@Roles('admin')` (`pm-identity.module.ts:143`); make sure you ran this as admin on `dar-blockchain` and not as a lead. Capture the 404's full query string; the `reason` parameter is the server's own message.

**Result** ☐ pass ☐ fail ☐ pass-with-404 — notes: ______

## 5. Continue with Plumo again, now that you are linked · MAJOR

**Setup** Scenario 4 left the card saying "disconnect".

**Steps** Sign out of Profile A. Click **Continue with Plumo**, same PM identity as scenario 3.

**Expect** You sign in. No collision message this time.

**Proves** `resolvePmUser` now finds you by `pm_user_id` at `auth.service.ts:240` and never reaches the email check at `:246`. This is the end-to-end path that has never been completed: password account → link → PM sign-in works. It also confirms scenario 4's write really committed.

**If it fails** with the collision message again → the link did not commit, and scenario 4 is a genuine failure rather than a cosmetic one. Send me the 404's query string from scenario 4.

**Result** ☐ pass ☐ fail — notes: ______

---

# Group 3 — Invitations

*No invitation has ever been created, sent, or accepted. This is the highest-value group in the document.*

## 6. Create and send an invitation · BLOCKER

**Setup** Whichever profile is admin of your **inviting desk** (preflight step 6). Situation A: Profile A on `dar-blockchain`. Situation B: Profile B on `firas2workspace`.

**Steps**
1. Settings → team & users → **invite someone**.
2. Invitee address per preflight step 6. Role: `agent`. Leave team empty.
3. **Send the invitation.** Keep the Network tab.

**Expect**
- `POST /invitations` returns 200 in **under 15 seconds**, toast `invitation on its way to … ✿`.
- The row appears under **pending invitations** with an expiry seven days out (`invitations.service.ts:35`).
- The mail arrives. Subject: `<your name> invited you to <desk> on plumo`. The link is `https://cs.plumo.work/accept-invite?token=…` — **console origin, not the api**. Check that; a link on `csapi.` is a dead invitation for every tester.

**Proves** The create path plus the inline SMTP send at `invitations.service.ts:184-198` — which is deliberately allowed to fail the request, so a pending row you can see is an email that really went out.

**If it fails**
- **503, "could not be emailed, so nothing was created"** → Resend rejected the recipient. In Situation B this is the *correct* answer for any address other than yours, and it is worth doing once on purpose: **invite `someone@example.com`, confirm the 503 and confirm no pending row was left behind.** That proves the rollback.
- **500 after ~15 seconds** → the send outran the request transaction (`WORKSPACE_TX_TIMEOUT_MS`, 15s, `configuration.ts:34`) while nodemailer's default connect timeout is 2 minutes. The invitation rolled back but the mail may still go out — check your inbox before re-sending, and if you see it, tell me: the fix is three timeout options on the transport.
- **409, already a member** → you invited an address that already holds an active seat on that desk (`invitations.service.ts:120-122`). Correct behaviour; pick another address.
- **Unexplained 500 with no message** → most likely two invitations to the same address racing (P2002 is unmapped). Send me the `requestId` from the response body.

**Result** ☐ pass ☐ fail — notes: ______

## 7. Accept it — new account, chooses a password · BLOCKER

**Situation B: not runnable.** The only deliverable address already has a CS account, so there is no new-account path to walk. Closest thing you *can* run: scenario 8, plus the deliberate 503 in scenario 6. Mark this row **blocked**, not failed, and verify the domain before Monday — a tester who cannot create an account cannot be a tester.

**Setup** Situation A. Open the emailed link in **Profile B** (signed out, or use a third profile — accepting replaces whatever session is stored).

**Steps** Open the link → a "Join `<desk>`" form with the invited address shown → type a name and a password of at least 8 characters → **Join the desk**.

**Expect**
- You land **inside the console**, signed in, on the queue — not on a sign-in screen holding a password you just chose.
- Back in Profile A: the pending row is gone and the person is in the team table.

**Proves** The single riskiest untested sequence in the product: `app_resolve_invitation` (SECURITY DEFINER, read on a connection with no workspace bound), then account creation, then `app_set_workspace`, then the RLS-covered writes, all in one transaction (`invitations.service.ts:404-533`).

**Also worth 10 seconds:** press browser **back**, or reload the accept page. Expect `that link is missing its token — open the one in your email again.` The token is stripped from the URL on first read (`accept-invite/page.jsx:158-172`). That message is honest — unlike the reset page, see scenario 12.

**If it fails**
- `This invitation link is not valid` on **first** open → `app_resolve_invitation` returned nothing. Either the grant or the column aliases. This is the failure mode I most expect; send me the response body of `GET /invitations/token/…`.
- **500 on accept, and the link then reports "already used"** → the bind-then-write ordering. The token is burnt and the invitee cannot retry; send them a fresh invitation and send me the server log around that timestamp.
- Lands on the sign-in screen instead of the queue → the session was issued but not stored. Check localStorage for `plumo.session` in that profile.

**Result** ☐ pass ☐ fail ☐ blocked — notes: ______

## 8. Accept it — an address that already has an account · MAJOR

**This scenario also creates the dual-membership subject for scenario 10. Do not skip it.**

**Setup**
- Situation A: from Profile A on `dar-blockchain`, invite **the second PM account's email address**. Accept it in Profile B.
- Situation B: this is the invitation you already sent in scenario 6. Open it in **Profile A**.

**Steps** Open the link. There is **no password form** — a confirmation screen instead. Click **Accept and go in**.

**Expect**
- The screen says the address already has a plumo account and *"your password stays exactly as it is"*.
- You land inside, on the **invited** desk.
- **One user, two seats.** No second account was created.
- Situation B: your Profile A session is now on `firas2workspace`. That is correct and expected — accepting replaces the stored session. Your `dar-blockchain` access is unaffected; you just have to sign in again later.

**Proves** `needsPassword: false` at `invitations.service.ts:345`, and the rule at `:389-402` — an existing password is **never** touched even if one is sent. One human, one account, many desks.

**If it fails**
- A second account is created for the same address → serious; tell me at once.
- It asks for a password → the lookup did not find the existing user; check the `GET /invitations/token/…` body for `needsPassword`.
- `You are already a member of …` → you invited an address that already holds an active seat there. Use the other desk.

**Result** ☐ pass ☐ fail — notes: ______

## 9. Revoke, re-invite, and a garbage token · MAJOR

**Setup** As the inviting admin.

**Steps and expected**

| Do | Expect |
|---|---|
| a. Invite a second address. **Before** opening the link, revoke it from the pending list. Then open the link. | `This invitation won't work.` — and no account is created. |
| b. Invite the **same address again**. Open the **first** (now superseded) link. | Also refused. Re-inviting revokes the outstanding one (`invitations.service.ts:135-138`) — one seat must never have two live keys. |
| c. Open the **new** link. | Works normally. |
| d. Open `https://cs.plumo.work/accept-invite?token=deadbeef` | Same generic refusal. No stack trace, no hint that the token was the wrong *shape* (`invitations.service.ts:553` rejects anything that is not 64 hex characters before it touches the database). |

**Proves** Revocation actually revokes, re-invitation replaces rather than accumulates, and the refusal is uniform across "never existed", "expired", "revoked" and "used" (`invitations.service.ts:296-311`).

**If it fails** — (b) working is the dangerous one: it means revoking the invitation you can see leaves another one alive. Tell me.

**Note for your own records:** the invitation token travels as a URL path segment and `req.url` is not in the pino redact list (`app.module.ts:56`), so live tokens are sitting in your application log and in nginx's. Seven-day TTL, single use. Fine for a trusted-tester week; not fine once you have contractors reading logs.

**Result** ☐ pass ☐ fail — notes: ______

---

# Group 4 — Taking access away, and keeping it

*Run 10 before 11. Scenario 11 removes the account scenario 10 needs.*

## 10. Dual membership survives a token refresh · MAJOR

**Setup** The account from scenario 8 now holds **two active memberships**. Be signed in as that account, in the profile where you accepted.

**You do not have to wait 15 minutes.** Force the refresh. DevTools → Console, on `cs.plumo.work`:

```js
const k = 'plumo.session';
const st = localStorage.getItem(k) ? localStorage : sessionStorage;
const s = JSON.parse(st.getItem(k));
s.accessToken = s.accessToken.slice(0, -3) + 'aaa';   // break the signature only
st.setItem(k, JSON.stringify(s));
location.reload();
```

**Steps** Run it. Watch the Network tab through the reload.

**Expect**
1. `GET /auth/me` → **401** (expected — you just broke the token).
2. `POST /auth/refresh` → **200**, and **it carries an `x-workspace-slug` request header**. Click the request and check. This header is the entire fix.
3. `GET /auth/me` retried → 200. You are still signed in, on the same desk.

**Proves** `client.js:158-175` sends `workspace: true` on a route that is `auth: false`, and `auth.controller.ts:42-43` reads it. Without the header, `resolveForUser` reaches `soleMembership`, which returns nothing for a two-membership user (`20260807130000_sole_membership_fallback/migration.sql`, `LIMIT 2`), falls through to a 403, and `client.js:222-229` treats a failed refresh as session death — a logout every fifteen minutes, forever, for exactly the people invitations create.

**If it fails** — you land on the sign-in screen → capture the `/auth/refresh` request and response. Two things to check on it: is `x-workspace-slug` present, and is the response `403` with `code: WORKSPACE_NOT_NAMED`.

**Two caveats on what a pass means.** If the header is **absent** and it still worked, the test proved nothing — `WORKSPACE_DEFAULT_SLUG` is pinning you (preflight step 5), and the two-desk case is still unproven. And a pass means *pinned*, not *portable*: there is no `GET /workspaces/mine` and no desk picker, so this account can reach only the desk its session started on. **One tester, one desk** remains the rule for next week.

**Result** ☐ pass ☐ fail ☐ inconclusive (no header) — notes: ______

## 11. DEACTIVATE — does the person really lose access · BLOCKER

*Until yesterday this button called no API at all and toasted "X deactivated". It has still never been pressed against a real server. This is the single most important control in the document.*

**Setup** Two profiles at once.
- **Admin profile**: signed in as an admin of the desk you are removing them from.
- **Victim profile**: signed in as the person being removed, sitting in the queue. Situation A: the account from scenario 7. Situation B: your main account on `firas2workspace` (from scenario 8) — see the warning below.

**Steps**
1. Victim profile: leave it open on the queue.
2. Admin profile: Settings → team & users → the ✕ on their row → confirm.
3. Victim profile: **click something that loads data** — another view, a ticket, the refresh.
4. Victim profile: **reload the page.**
5. Victim profile: try to sign in with the correct password.

**Expect**

| Step | Expected |
|---|---|
| 2 | Success line only after a 2xx, and the person **disappears from the table**. There is no ✕ on your own row (`Console.jsx:1882`). |
| 3 | **Their next request fails. Immediately — not in 15 minutes.** They will see failures/empty views rather than being thrown out, because the console only treats a 401 as session death and this is a 403. In Network: `403`, `code: WORKSPACE_MEMBERSHIP_DISABLED`. |
| 4 | Reload dumps them on the sign-in screen (bootstrap throws, `Console.jsx:334-338`). |
| 5 | Refused. Either `this account can't reach this workspace. ask an admin to invite you.` **or** `your access to this workspace has been turned off. an admin can switch it back on.` — both are correct; see below. |

**How long the existing access token keeps working: zero seconds.** `AuthGuard` does not trust the token for authority — it re-resolves the membership from the database on every single authenticated request (`auth.guard.ts:69-72`), and `workspace-context.service.ts:164-169` refuses a deactivated one. Their refresh tokens are revoked too, globally (`users.module.ts:174`). The 15-minute access TTL buys them nothing. **This is the fastest lever you have, and it is the one to reach for if a tester goes wrong next week.**

**Which of the two step-5 messages you get tells you your server config.** The console never sends `x-workspace-slug` on `/auth/login` (deliberately — its body is the credential). So the login resolves by inference: with `WORKSPACE_DEFAULT_SLUG` **unset**, two active desks means no default, and you get the first message (`WORKSPACE_NOT_NAMED`). With it **set**, the named desk resolves and returns the deactivated membership, giving the second message (`WORKSPACE_MEMBERSHIP_DISABLED`). Either way it is a 403 and not the credential line — which is the thing being tested. This is also the "no access" case deferred from scenario 1.

**What this does NOT do:** it deactivates the *membership*, not the person. `users.is_active` stays true, their replies stay on every ticket, and they can be invited back — scenario 8's accept reactivates the same row rather than creating a second (`invitations.service.ts:466-474`).

> **Situation B warning:** deactivating your main account's `firas2workspace` seat revokes **all** of that account's refresh tokens, including Profile A's `dar-blockchain` session. You will be signed out there at its next refresh. Expected, harmless, one re-login.

**If it fails**
- The toast says it worked and step 3 still succeeds → capture `DELETE /users/:id`. A 2xx with no effect is the worst outcome here; tell me at once.
- 403 on the delete itself → you are not admin on that desk, or you clicked your own row (there should be no button there).
- 404 → the user is not a member of the desk you are admin of (`users.module.ts:169`).
- They keep working for several minutes → `AuthGuard` stopped re-reading membership. That is a serious regression; send me a successful request made *after* the deactivation, with its response.

**Result** ☐ pass ☐ fail — notes: ______

---

# Group 5 — Password lifecycle

*Cheapest group, smallest blast radius. Run it if you have ten minutes left.*

## 12. Reset password, redeemed to the end · MAJOR

**Setup** Profile A, signed out. Use your main account — you know its password and can put it back.

**Steps**
1. Forgot password → your address → **Send me a link**.
2. Open the mail. Click the link. Set a new password. Submit.
3. Sign in with the **new** password.
4. Try the **old** password.
5. Check whether Profile B's session (any account you left signed in) survived.

**Expect**
- 2 → `That's done ✿ … your new password is saved and every other session has been signed out.`
- 3 → works. 4 → refused with the credential line.
- 5 → **the other session dies only at its next refresh, not instantly.** Reset revokes refresh tokens (`auth.service.ts:625-628`) and cannot revoke access tokens; the page's claim at `reset-password/page.jsx:230` is up to 15 minutes optimistic. Not a bug to fix this week — a sentence to know when a tester reports it.

**Proves** The only part of reset that has never run: that submitting the form actually changes the password, burns the token and revokes sessions. Everything up to "the link opens" was already proven.

**Also worth 10 seconds, because it will bite a tester:** open the reset link, then **reload the page**. It will tell you `reset links are good for an hour and can only be used once — this one is past that, or has already been used.` **That is false** — the page stripped the token from the URL at `reset-password/page.jsx:83-90` and has nothing left to submit. The link was fine. Know this answer for support: *don't reload, use the link fresh.*

**If it fails**
- No mail arrives → this one goes through the **worker queue**, unlike invitations which send inline. So this doubles as your worker check. `docker compose logs --tail=100 worker`.
- The link 404s → it was built from `appUrl` instead of `consoleUrl`. Check the host in the emailed URL.
- Submitting says the link is invalid on the first try → check you did not reload first.

**Result** ☐ pass ☐ fail — notes: ______

## 13. Change password, and logout · MINOR

**Setup** Signed in in two profiles as the **same** account.

**Steps and expected**

| Do | Expect |
|---|---|
| a. Account → password → current + new → save password | Toast: `password changed — you're still signed in ✿` |
| b. Keep working in that tab for 15+ minutes | **You will be silently signed out**, mid-draft, with no message. `auth.service.ts:645-648` revokes every refresh token including the caller's own — the toast is true about the access token and wrong about the session. Known; the fix is one line. Confirm it so you are not surprised on Monday. |
| c. In the other profile, sign out (Account → sign out) | That session ends. |
| d. Back in the first profile, click something | **It still works.** Logout revokes only the refresh token it was handed (`auth.service.ts:475-478`). There is no "sign out everywhere" in this product — no endpoint, no decision recorded. |

**Proves** Both were UNRUN. (b) and (d) are the two answers you will need when a tester asks "why was I logged out" and "did signing out on my laptop cover my phone".

**If it fails** — (a) returning `the current password isn't right` when it is → note that a PM-provisioned account can never pass this check, since it has no password it could know (`auth.service.ts:637`). The card is shown to everyone regardless (`Account.jsx:62-70`). Only a real failure if you used a password account.

**Result** ☐ pass ☐ fail — notes: ______

---

# What to do with the results

**To record a pass:** tick the box in the scoreboard and move on. If the expected string differed but the *outcome* was right, tick it and paste the actual string in the notes — wording drift is worth knowing but is not a failure.

**For anything that fails, send me these four things.** With all four I can act without asking you anything:

1. **The scenario number** and which situation you were in (A or B).
2. **The failing request, from the Network tab.** Right-click → Copy → **Copy as cURL**, then delete the `authorization:` header before sending. I need the request headers — half the scenarios above turn on whether `x-workspace-slug` was present.
3. **The full response body**, including `requestId` if there is one. That id is in the API log and is how I find your exact request.
4. **The server's side of it:** `docker compose logs --tail=200 api` (and `worker` for scenario 12), timestamped near the failure.

**Add a fifth for state-changing failures** (scenarios 6–11): say what the *database* looks like afterwards. Did the pending invitation survive? Is the person still in the team table? Did a second desk appear? Half of these bugs are "it reported failure and committed anyway", and the report alone cannot tell them apart from "it failed cleanly".

**Three answers to write down even on a pass,** because they change what you tell testers:

- Which desk scenario 2 landed on.
- Whether `x-workspace-slug` was present on the refresh in scenario 10.
- Which of the two step-5 messages scenario 11 produced.

**If you only get through Group 1 and Group 3:** that is enough to decide whether to invite anyone. Groups 4 and 5 decide whether the week is comfortable.
