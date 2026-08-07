#!/usr/bin/env bash
#
# Which accounts hold BOTH a Plumo PM identity and a password PM cannot revoke?
#
# THIS SCRIPT WRITES NOTHING. Not to the database, not to the app directory. The
# first statement of every psql session is
#   SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;
# so it is Postgres refusing the write, not this script promising not to. The
# only file it creates is a temporary node program under /tmp, deleted on exit.
# Remediation is PRINTED for a human to read, consider and run. It is never run
# here.
#
# WHY THIS EXISTS
#
# forgotPassword() no longer mints a reset token for an account with
# users.pm_user_id, because loginWithPm() re-checks the PM role, the desk link
# and the desk status on every sign-in while login() checks none of them and
# cannot — CS has no way to ask PM about a `sub` without that person's own
# token. So a password on a PM-linked account outlives being demoted or removed
# in PM, permanently.
#
# That fix is not retroactive. Anyone who completed a reset before it shipped
# still holds a working password, and an account provisioned by PM that was
# given a password by some other route still holds one. Code cannot find those
# people. An operator can.
#
# WHY IT IS HARDER THAN `WHERE password_hash IS NOT NULL`
#
# A PM-provisioned account is created by resolvePmUser() with
#   passwordHash: await argon2.hash(randomBytes(32).toString('hex'))
# — a genuine argon2 hash, with the same defaults every real password uses.
# Deliberately so: the ordinary argon2.verify path stays valid and simply can
# never match. The consequence is that the PRESENCE of a password hash proves
# nothing at all, and the hash column cannot be interrogated. Everything below
# is an attempt to answer the question from the surrounding evidence instead,
# and it is honest about which answers are certain and which are guesses.
#
# Usage, on the production host:
#   bash /opt/plumo-cs/source/backend/ops/audit-pm-passwords.sh
#   bash .../audit-pm-passwords.sh | tee ~/pm-password-audit-$(date -u +%F).txt

set -Eeuo pipefail

DB=plumo_cs
APP_DIR=/opt/plumo-cs/app

# The moment PM sign-in became possible on this deployment. Read from
# _prisma_migrations rather than hardcoded, so a host that adopted PM on a
# different day still gets the right cut-off — and so a database restored from
# a dump keeps the original timestamp, which pg_dump preserves.
PM_LINK_MIGRATION=20260807010000_pm_identity_link

# Colour only on a terminal. This output goes into tickets.
if [[ -t 1 ]]; then C_H=$'\033[1;36m'; C_W=$'\033[1;33m'; C_R=$'\033[1;31m'; C_0=$'\033[0m'
else C_H=''; C_W=''; C_R=''; C_0=''; fi
log()  { printf '\n%s==> %s%s\n' "$C_H" "$*" "$C_0"; }
warn() { printf '%s[warn] %s%s\n' "$C_W" "$*" "$C_0"; }
die()  { printf '\n%s[FAIL] %s%s\n' "$C_R" "$*" "$C_0" >&2; exit 1; }

# Read-only twice over, and the order matters.
#
# PGOPTIONS is the one that actually enforces it: default_transaction_read_only
# is applied when the connection is established, so the very first statement is
# already inside a read-only transaction. The in-band SET below cannot achieve
# that on its own — psql -c with several statements runs them in ONE implicit
# transaction that has already begun read-write by the time the SET executes.
# It stays anyway because it is visible to whoever reads this file, which is the
# point of claiming a script is read-only.
#
# search_path is pinned because this runs as postgres, not as plumo_app, and a
# role-level search_path on the superuser would silently resolve `users` to
# something else. The app connects with ?schema=public; so does this.
RO='SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY; SET search_path = public;'
psql_ro() {
  sudo -u postgres env PGOPTIONS='-c default_transaction_read_only=on' \
    psql -d "$DB" -v ON_ERROR_STOP=1 -P pager=off "$@"
}
scalar() { psql_ro -tAc "$RO $1"; }

tmp=$(mktemp /tmp/plumo-pm-audit.XXXXXX)
trap 'rm -f "$tmp"' EXIT

# ---------------------------------------------------------------- preflight --

command -v psql >/dev/null || die "psql is not on PATH. This is not the database host."
scalar 'SELECT 1' >/dev/null 2>&1 || die "Cannot reach $DB as the postgres role."

# THE MOST IMPORTANT CHECK IN THE SCRIPT. audit_log carries workspace_id and is
# under the workspace_isolation policy. A connection that does not bypass RLS,
# with no workspace bound, reads ZERO audit rows — and this report would come
# back clean and confident having seen none of the evidence. A falsely reassuring
# audit is worse than no audit, so refuse rather than qualify.
bypass=$(scalar "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")
[[ "$bypass" == "t" ]] || die "Connected as '$(scalar 'SELECT current_user')', which does not bypass row-level security.
    audit_log would read empty and this report would look clean for the wrong reason.
    Run it as the postgres superuser."

has_pm=$(scalar "SELECT count(*) FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'pm_user_id'")
[[ "$has_pm" == "1" ]] || die "users.pm_user_id does not exist — this database predates PM identity. Nothing to audit."

PM_EPOCH=$(scalar "SELECT finished_at FROM _prisma_migrations
                    WHERE migration_name = '$PM_LINK_MIGRATION' AND finished_at IS NOT NULL")
[[ -n "$PM_EPOCH" ]] || die "$PM_LINK_MIGRATION is not recorded as applied. Cannot establish when PM sign-in became possible."

total=$(scalar "SELECT count(*) FROM users WHERE pm_user_id IS NOT NULL")
all_users=$(scalar "SELECT count(*) FROM users")

cat <<BANNER

  Plumo CS — PM identity / password audit
  database : $DB on $(hostname)
  as of    : $(date -u +%FT%TZ)
  PM epoch : $PM_EPOCH  (from $PM_LINK_MIGRATION)
  scope    : $total of $all_users accounts carry a PM identity

  READ-ONLY. Every query below runs in a read-only session; nothing is modified.

  Question: which accounts can be signed into with a password, when the only
  authority that can take that access away is Plumo PM — which has no idea the
  password exists?
BANNER

if [[ "$total" == "0" ]]; then
  log "No account carries a PM identity. Nothing to audit."
  exit 0
fi

# ------------------------------------------------------------- the evidence --
#
# What each source can and cannot prove:
#
#   password_resets.used_at IS NOT NULL
#       CERTAIN. resetPassword() stamps used_at in the same transaction that
#       writes password_hash. A consumed row is a password a human chose.
#
#   refresh_tokens.created_at < PM epoch
#       CERTAIN. Before that migration, login() was the only way to mint one.
#       Nothing in the codebase ever DELETEs a refresh token — logout, password
#       change and deactivation all set revoked_at — so this history is complete
#       rather than merely surviving.
#
#   audit_log (entity_type='user', action='create')
#       CERTAIN. Written only by UsersService.create, which hashes an
#       operator-supplied password. That account was born with a real one.
#
#   audit_log (entity_type='user', action='pm.link')
#       INFERRED. Linking happens from Settings while signed in, and a not-yet-
#       linked account cannot sign in through PM — so the session behind it was
#       almost certainly a password login. Not certain, because an already-linked
#       account can re-run the link flow and produce the same row.
#
#   users.created_at < PM epoch
#       INFERRED. The account cannot have been PM-provisioned; it was created by
#       the admin path or the seed, both of which set a real password. Weaker
#       than it sounds only because it says nothing about whether that password
#       was ever delivered to a human.
#
#   users.updated_at
#       WORTHLESS, AND THE OBVIOUS THING TO REACH FOR. Both login() and
#       loginWithPm() write lastActiveAt on every sign-in, and updated_at is
#       Prisma's @updatedAt — so it is bumped by every sign-in of either kind,
#       plus every profile edit. It is not shown below on purpose.

log "1. Accounts holding a PM identity — evidence and verdict"

psql_ro <<SQL
$RO
\pset border 2
\pset expanded auto

WITH epoch AS (SELECT '$PM_EPOCH'::timestamptz AS ts),
pm_users AS (
  SELECT id, email, is_active, created_at FROM users WHERE pm_user_id IS NOT NULL
),
resets AS (
  SELECT user_id,
         count(*) FILTER (WHERE used_at IS NOT NULL)                   AS consumed,
         max(used_at)                                                  AS last_consumed,
         count(*) FILTER (WHERE used_at IS NULL AND expires_at > now()) AS live
    FROM password_resets GROUP BY user_id
),
pre_pm_sessions AS (
  SELECT r.user_id, count(*) AS n
    FROM refresh_tokens r, epoch e
   WHERE r.created_at < e.ts
   GROUP BY r.user_id
),
made_by_operator AS (
  SELECT entity_id AS user_id FROM audit_log
   WHERE entity_type = 'user' AND action = 'create' GROUP BY entity_id
),
linked_from_settings AS (
  SELECT entity_id AS user_id FROM audit_log
   WHERE entity_type = 'user' AND action = 'pm.link' GROUP BY entity_id
),
desks AS (
  -- role and status are Postgres enum types; ::text explicitly, because
  -- text || enum is not an operator Postgres will resolve for you.
  SELECT m.user_id,
         string_agg(w.slug || ':' || m.role::text ||
                    CASE WHEN NOT m.is_active THEN ' (membership off)'
                         WHEN w.status <> 'active' THEN ' (desk ' || w.status::text || ')'
                         ELSE '' END,
                    ', ' ORDER BY w.slug) AS all_desks,
         string_agg(w.slug, ', ' ORDER BY w.slug)
           FILTER (WHERE m.role = 'admin' AND m.is_active AND w.status = 'active') AS admin_of
    FROM workspace_memberships m JOIN workspaces w ON w.id = m.workspace_id
   GROUP BY m.user_id
),
scored AS (
  SELECT u.email,
         u.is_active,
         d.admin_of,
         d.all_desks,
         CASE
           WHEN coalesce(r.consumed, 0) > 0 THEN 'CERTAIN'
           WHEN coalesce(s.n, 0) > 0        THEN 'CERTAIN'
           WHEN o.user_id IS NOT NULL       THEN 'CERTAIN'
           WHEN u.created_at < e.ts         THEN 'LIKELY'
           WHEN l.user_id IS NOT NULL       THEN 'LIKELY'
           ELSE 'UNKNOWN'
         END AS verdict,
         concat_ws('; ',
           CASE WHEN coalesce(r.consumed,0) > 0
                THEN 'completed ' || r.consumed || ' password reset(s), last ' || to_char(r.last_consumed,'YYYY-MM-DD') END,
           CASE WHEN coalesce(s.n,0) > 0
                THEN s.n || ' session(s) predate PM sign-in' END,
           CASE WHEN o.user_id IS NOT NULL
                THEN 'created via POST /users with an operator-set password' END,
           CASE WHEN l.user_id IS NOT NULL
                THEN 'PM linked from Settings (was signed in already)' END,
           CASE WHEN u.created_at < e.ts
                THEN 'account predates PM sign-in (' || to_char(u.created_at,'YYYY-MM-DD') || ')' END,
           CASE WHEN coalesce(r.live,0) > 0
                THEN r.live || ' UNUSED reset token still within its hour' END
         ) AS evidence
    FROM pm_users u
    CROSS JOIN epoch e
    LEFT JOIN resets r              ON r.user_id = u.id
    LEFT JOIN pre_pm_sessions s     ON s.user_id = u.id
    LEFT JOIN made_by_operator o    ON o.user_id = u.id
    LEFT JOIN linked_from_settings l ON l.user_id = u.id
    LEFT JOIN desks d               ON d.user_id = u.id
)
-- all_desks as well as admin_of: an agent membership is still access to that
-- desk's tickets, and it is just as unrevokable from PM as an admin one.
SELECT email,
       CASE WHEN is_active THEN 'yes' ELSE 'DISABLED' END AS active,
       verdict,
       coalesce(admin_of, '—')                            AS "admin of (live desks)",
       coalesce(all_desks, '—')                           AS "all memberships",
       coalesce(nullif(evidence, ''), 'none found')       AS evidence
  FROM scored
 ORDER BY CASE verdict WHEN 'CERTAIN' THEN 0 WHEN 'LIKELY' THEN 1 ELSE 2 END,
          is_active DESC, email;
SQL

cat <<'MEANING'

  Every row above is PM-linked by construction — the table is `users` filtered to
  pm_user_id IS NOT NULL. An account with no PM identity is out of scope here: it
  has no second authority that could be revoking access behind CS's back.

  CERTAIN   A human chose, or was handed, this account's password. PM cannot
            revoke it. Treat as a live credential.
  LIKELY    The account existed before PM sign-in did, or was linked from a
            session PM did not create. Probably a real password; confirm with
            the person before acting.
  UNKNOWN   Created after PM sign-in shipped, with no reset ever completed and
            no session predating PM. Consistent with a pure PM-provisioned
            account — but this is the absence of evidence, NOT evidence of
            absence. The schema cannot rule out a password here. See section 4.
MEANING

log "2. Desks these accounts reach, and who could revoke them"

# A desk with no pm_workspace_id is one PM has no say over at all: removing
# someone in PM changes nothing there even for a PM-only sign-in, because
# loginWithPm never consults it. Worth seeing next to the account list.
psql_ro <<SQL
$RO
\pset border 2
SELECT w.slug AS desk,
       w.status,
       CASE WHEN w.pm_workspace_id IS NULL THEN 'no — standalone desk'
            ELSE 'yes' END AS "PM can revoke membership",
       count(*) FILTER (WHERE u.pm_user_id IS NOT NULL AND m.role = 'admin' AND m.is_active) AS "pm-linked admins",
       count(*) FILTER (WHERE m.is_active) AS "active members"
  FROM workspaces w
  LEFT JOIN workspace_memberships m ON m.workspace_id = w.id
  LEFT JOIN users u ON u.id = m.user_id
 GROUP BY w.id, w.slug, w.status, w.pm_workspace_id
 ORDER BY w.slug;
SQL

log "3. Known-plaintext check"

# The one test that beats the indistinguishable-hash problem head on: stop
# reasoning about provenance and just try the passwords this repo is known to
# create. prisma/seed.ts hashes the literal 'password123' for every seeded
# account, and a seeded account that was later linked to PM is the worst case in
# this whole audit — a published password on an admin PM cannot reach.
#
# A hit is proof. A miss proves nothing whatsoever, and is reported that way.
#
# Hashes are streamed straight into node and never written to disk or echoed.
if [[ -f "$APP_DIR/package.json" && -d "$APP_DIR/node_modules/argon2" ]]; then
  cat >"$tmp" <<'NODE'
const argon2 = require("argon2");
// Only passwords this repository itself is known to write. Deliberately not a
// wordlist: this is an inventory of our own defaults, not a cracking run.
const KNOWN = [["password123", "prisma/seed.ts default"]];
let buf = "";
process.stdin.on("data", (c) => (buf += c));
process.stdin.on("end", async () => {
  const rows = buf.split("\n").filter((l) => l.includes("\t"));
  let hits = 0;
  for (const line of rows) {
    const i = line.indexOf("\t");
    const email = line.slice(0, i);
    const hash = line.slice(i + 1).trim();
    for (const [pw, source] of KNOWN) {
      let ok = false;
      try { ok = await argon2.verify(hash, pw); } catch { ok = false; }
      if (ok) { hits++; console.log("  CONFIRMED  " + email + "  — password is the " + source); }
    }
  }
  console.log("  checked " + rows.length + " PM-linked account(s) against " + KNOWN.length + " known default(s); " + hits + " match(es).");
  if (hits === 0) {
    console.log("  A miss is not a clean bill of health — it only rules out OUR defaults.");
  }
});
NODE
  if [[ "$total" -gt 200 ]]; then
    warn "$total candidates — argon2 verification is deliberately slow (~50ms each) and this would take minutes. Skipping."
  else
    psql_ro -tA -F $'\t' -c "$RO SELECT email, password_hash FROM users WHERE pm_user_id IS NOT NULL" \
      | ( cd "$APP_DIR" && node "$tmp" )
  fi
else
  warn "argon2 not resolvable from $APP_DIR — skipping the known-plaintext check. Run this on the app host."
fi

log "4. What this audit CANNOT tell you"

cat <<'LIMITS'
  Read this before reporting the result as clean.

  - There is no column recording that a password was ever deliberately SET. A
    PM-provisioned account's password_hash is a real argon2 hash of 32 random
    bytes, produced by the same argon2.hash() defaults every real password uses:
    same algorithm, same m/t/p, same length. It is not distinguishable from a
    chosen password by inspection, by length, or by parameters.

  - Consequently every UNKNOWN above is genuinely unknown. An account
    provisioned by PM and later given a password through a route that left no
    consumed password_resets row — a direct UPDATE, a restore from a dump taken
    before the fix, a script — reads exactly like an account that never had one.

  - refresh_tokens records that a session was created, never HOW. After the PM
    epoch a token could come from either login path. pm_oauth_states would
    correlate a PM sign-in to the second, but consumed and expired rows are
    pruned an hour later on purpose (the code_verifier is a secret with no
    reason to linger), so there is no history to join against.

  - identity_audit_log exists and is empty. It was created as the destination
    for exactly these events — login, login.failed, password.reset — and nothing
    writes to it yet. Had it been wired up, this script would be a single SELECT.

  - users.updated_at is not evidence of anything: every sign-in of either kind
    writes lastActiveAt, which bumps it.
LIMITS

log "5. What to do — SQL to READ, then run yourself"

cat <<'REMEDY'
  Nothing below has been executed. Run it deliberately, one account at a time,
  after talking to the person. A blanket UPDATE across the CERTAIN list would
  lock out every admin who legitimately signs in with a password today, and the
  reset path will refuse to give it back to them.

  For each account you decide should sign in through Plumo ONLY:

    BEGIN;
    -- 1. Retire the password. A sentinel, not another argon2 hash: argon2.verify
    --    rejects it outright, which is the same state a PM-provisioned account
    --    is meant to be in. There is no undo — the account can never again get a
    --    reset token, by design.
    UPDATE users
       SET password_hash = 'retired:' || gen_random_uuid()
     WHERE email = 'someone@example.com'
       AND pm_user_id IS NOT NULL;          -- refuses to fire on a non-PM account

    -- 2. Retiring the password does not close the sessions it already opened.
    UPDATE refresh_tokens SET revoked_at = now()
     WHERE user_id = (SELECT id FROM users WHERE email = 'someone@example.com')
       AND revoked_at IS NULL;

    -- 3. Any unused reset token still inside its hour.
    UPDATE password_resets SET expires_at = now()
     WHERE user_id = (SELECT id FROM users WHERE email = 'someone@example.com')
       AND used_at IS NULL AND expires_at > now();

    -- Read the row back before you commit.
    SELECT email, left(password_hash, 8) AS hash_prefix, is_active
      FROM users WHERE email = 'someone@example.com';
    COMMIT;

  Their access tokens stay valid until they expire; step 2 only stops renewal.
  If the account must be out NOW, also set users.is_active = false — refresh()
  and both login paths check it on every call.

  For a LIKELY or UNKNOWN account, do not guess. Ask the person whether they
  have a password for Plumo CS. That single question is more reliable than
  anything this script can infer, and it is the honest reason section 4 exists.

  THE PERMANENT FIX IS ONE COLUMN:

    ALTER TABLE users ADD COLUMN password_set_at timestamptz;

  Written by UsersService.create, resetPassword and changePassword; left NULL by
  resolvePmUser. Then this entire script collapses to

    SELECT email FROM users WHERE pm_user_id IS NOT NULL AND password_set_at IS NOT NULL;

  and it is a fact rather than an inference. The CERTAIN rows above are the
  backfill: set password_set_at for them and leave the rest NULL, accepting that
  a handful of UNKNOWNs will be recorded as passwordless when they are not.
REMEDY

log "Audit complete — nothing was modified"
