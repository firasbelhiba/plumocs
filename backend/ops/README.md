# backend/ops

Scripts an operator runs on the production host. Not part of the build, not
imported by the app.

Production today is **native**: node under systemd (`plumo-api.service`,
`plumo-worker.service`), native Postgres on the same box, nginx in front. The
container topology was written and never adopted, which is why two deploy
scripts exist and only one of them is real.

| script | what it does | safe to re-run? |
| --- | --- | --- |
| `deploy-native.sh` | **The deploy.** Syncs source, builds, restarts both units, health-checks, rolls back to `dist.prev` on failure. | yes |
| `deploy.sh` | Deploy for the container topology. Not the one production uses. | yes |
| `build.sh` | Builds the two tagged images `deploy.sh` expects. Container topology only. | yes |
| `pg-backup.sh` | Logical `pg_dump` from cron, with retention. | yes |
| `restore.sh` | **Destructive.** Replaces the live database from a dump. | no — read it first |
| `audit-pm-passwords.sh` | Read-only report: accounts holding both a PM identity and a password. | yes |

## Migrations are never applied silently

`deploy-native.sh` refuses to deploy over pending migrations. Applying them is
`WITH_MIGRATIONS=1`, which takes a fresh backup first and connects as
`plumo_migrator` — `plumo_app` owns nothing and cannot run DDL. That split is
also what makes row-level security enforce anything: a table owner is exempt
from its own policies, so a runtime connecting as the owner would leave every
policy installed and inert.

## Verifying a backup can actually be restored

`pg-backup.sh` reads the archive's table of contents (`pg_restore -l`) to prove
the file is complete rather than truncated. That is a structural check, not a
restore, and it does not prove the dump reconstructs a working database.

A real check needs a scratch database and is heavy enough to belong on its own
schedule:

```sh
sudo -u postgres createdb plumo_cs_restorecheck
sudo -u postgres pg_restore -d plumo_cs_restorecheck --no-owner \
  /opt/plumo-cs/backups/daily-plumo_cs-<ts>.dump
sudo -u postgres psql -d plumo_cs_restorecheck -c \
  "SELECT count(*) FROM tickets; SELECT count(*) FROM users;"
sudo -u postgres dropdb plumo_cs_restorecheck
```

Run it against a dump you have not already trusted, not the newest one.

## audit-pm-passwords.sh

```sh
bash /opt/plumo-cs/source/backend/ops/audit-pm-passwords.sh
bash .../audit-pm-passwords.sh | tee ~/pm-password-audit-$(date -u +%F).txt
```

**Read-only.** It connects with `default_transaction_read_only=on`, so it is
Postgres refusing writes rather than the script promising not to. Remediation is
printed for a human to read and run; nothing is executed.

### The question it answers

`loginWithPm()` re-checks the PM role, the desk link and the desk status on every
sign-in. `login()` checks none of them and cannot — CS has no way to ask PM about
a `sub` without that person's own token. So a password on a PM-linked account
survives being demoted or removed in PM, permanently: PM revokes the identity and
the credential keeps working.

`forgotPassword()` now refuses to mint a reset token for an account with
`pm_user_id`, and `resetPassword()` repeats the refusal at the point of use. That
closes the route going forward. It does nothing about anyone who completed a
reset before it shipped, or any PM-provisioned account that acquired a password
by another route. Finding those people is an operator's job, and this is the tool.

### Run it as postgres

The script hard-fails on a role that does not bypass RLS. `audit_log` carries
`workspace_id` and sits under the `workspace_isolation` policy, so a connection
with no workspace bound reads **zero** audit rows — and the report would come
back clean and confident having seen none of the evidence. A falsely reassuring
audit is worse than no audit.

### Why the answer is not `WHERE password_hash IS NOT NULL`

`resolvePmUser()` creates a PM-provisioned account with a genuine argon2 hash of
32 random bytes, produced by the same `argon2.hash()` defaults every real
password uses. That is deliberate — the ordinary `argon2.verify` path stays valid
and simply can never match — and it means the hash column is uninterrogable.
Same algorithm, same m/t/p, same length. The presence of a password hash proves
nothing.

So the script reasons from the surrounding evidence, and grades it:

| verdict | basis |
| --- | --- |
| `CERTAIN` | a consumed `password_resets` row (`resetPassword` stamps `used_at` in the same transaction that writes `password_hash`); or a `refresh_tokens` row predating the PM migration, when `login()` was the only way to mint one; or an `audit_log` `user`/`create` row, written only by `UsersService.create`, which hashes an operator-supplied password |
| `LIKELY` | the account predates PM sign-in, or was linked from Settings while already signed in |
| `UNKNOWN` | no evidence either way — **not** a clean result |

It also verifies every PM-linked account's hash against the passwords this repo
itself is known to write (`prisma/seed.ts` hashes the literal `password123`). A
hit is proof. A miss rules out our own defaults and nothing else.

### What it cannot tell you

Every `UNKNOWN` is genuinely unknown. An account that was PM-provisioned and
later given a password by a route leaving no consumed reset row — a direct
`UPDATE`, a restore from a pre-fix dump, a script — is indistinguishable from one
that never had a password.

Two things that look like evidence and are not:

- **`users.updated_at`.** Both login paths write `lastActiveAt`, and `updated_at`
  is Prisma's `@updatedAt`, so it is bumped by every sign-in of either kind plus
  every profile edit. The script does not display it, on purpose.
- **`refresh_tokens` after the PM epoch.** The table records that a session was
  created, never how. `pm_oauth_states` would correlate PM sign-ins, but consumed
  and expired rows are pruned an hour later — the `code_verifier` is a secret
  with no reason to linger — so there is no history to join against.

`identity_audit_log` exists and is empty. It was created as the destination for
exactly these events (`login`, `login.failed`, `password.reset`) and nothing
writes to it yet. Wired up, this script would be a single `SELECT`.

### The permanent fix is one column

```sql
ALTER TABLE users ADD COLUMN password_set_at timestamptz;
```

Written by `UsersService.create`, `resetPassword` and `changePassword`; left NULL
by `resolvePmUser`. The audit then becomes a fact instead of an inference:

```sql
SELECT email FROM users WHERE pm_user_id IS NOT NULL AND password_set_at IS NOT NULL;
```

The `CERTAIN` rows this script reports are the backfill. Accept that a few
`UNKNOWN`s will be recorded as passwordless when they are not — that is the cost
of having shipped without the column, and it does not get cheaper by waiting.
