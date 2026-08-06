# Dockerising Plumo CS production

Status: **proposal, nothing executed.** Written 2026-08-06 against the live host.

---

## 1. What is actually running today

Verified over SSH, not assumed:

| | |
|---|---|
| Host | `44.201.154.81`, Ubuntu, 16 GB RAM, 58 GB disk (8% used) |
| API | `plumo-api.service` → `node dist/main.js`, listening on `127.0.0.1:3002` |
| Worker | `plumo-worker.service` → `node dist/worker.js` |
| Both units | `User=ubuntu`, `WorkingDirectory=/opt/plumo-cs/app`, `EnvironmentFile=/opt/plumo-cs/app/.env`, `Restart=always` |
| Hardening | `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome=read-only`, `ReadWritePaths=/opt/plumo-cs/app` |
| Postgres | **18, native**, port 5432 |
| Redis | **native**, `redis-server.service` |
| nginx | native, TLS via certbot, `csapi.plumo.work` → `proxy_pass 127.0.0.1:3002` |
| Node | **v22.22.1** on the host |
| Layout | `/opt/plumo-cs/{app,backups,secrets}` |
| Docker | **not installed** |
| Frontend | Vercel — outside this document entirely |

Two things worth flagging immediately:

- **`crontab -l` is empty.** Nothing takes a backup on a schedule. `/opt/plumo-cs/backups` exists but is populated by hand, if at all. This is a live database with real customer conversations in it.
- **The existing `backend/Dockerfile` pins `node:20-alpine`, but production runs Node 22.** That file is scaffolding left over from project setup and has never built this app in anger. Do not trust it as a starting point.

---

## 2. Scope: what to containerise, and what to leave alone

You asked to dockerise everything. My recommendation is **to containerise the two stateless services and leave the two stateful ones on the host.** The reasoning matters more than the conclusion, so:

### Containerise — API and worker

These are pure compute. They hold no state, they're the things that change on every deploy, and they're where the benefit lives: identical artefact from build to run, rollback by retagging, no more "did `npm ci` produce the same tree this time".

### Leave native — PostgreSQL and Redis

Not out of conservatism. Specifically:

- **This is a single host with no orchestrator.** Containerising a database buys portability you cannot use — there is nowhere to reschedule it to. What it costs is real: a volume-mount mistake, a `docker compose down -v`, or an image tag bump becomes a data-loss event rather than an inconvenience.
- **Major-version upgrades get harder, not easier.** `pg_upgrade` across container images is a genuinely unpleasant procedure compared to Ubuntu's `pg_upgradecluster`.
- **The security work you already did is host-level and correct.** The `plumo_app` / `plumo_migrator` split, `NOSUPERUSER`, `NOBYPASSRLS`, and the RLS policies Phase 3 will add all live inside the cluster. Containerising the cluster gains none of it and risks re-provisioning it wrong.
- **Redis here is a BullMQ broker.** It holds transient job state. Containerising it is churn with no upside.

If you still want Postgres in a container, §8 covers what changes and what it costs. I'd want that decision made deliberately, not by default.

---

## 3. Prerequisite — automated backups (blocking)

**Do not start this work until backups run on a schedule.** Every step below involves stopping the app, changing how it connects to the database, and running migrations. Without a restore path, a mistake is permanent.

This is not hypothetical: earlier in this project an unscoped `DELETE` destroyed real conversations, and the most recent backup predated them.

```bash
sudo -u postgres pg_dump -Fc plumo_cs -f /opt/plumo-cs/backups/plumo_cs-$(date +%F-%H%M).dump
```

Wrap that in a script with retention (keep 7 daily, 4 weekly), put it on cron, and — **this is the part people skip — restore one dump into a scratch database and confirm it comes back.** A backup you have never restored is a hypothesis, not a backup.

Exit criterion: a dump from cron, restored successfully into `plumo_cs_restoretest`, row counts matching.

---

## 4. Prerequisite — decide which commit gets built

`main` does not currently compile: 30 TypeScript errors across 7 files, all from Phase 2a landing the tenancy schema while the app still reads `users.role` and `users.team_id`. The running production binary was built from an earlier commit.

So before anything else:

```bash
ssh -i plumo.pem ubuntu@44.201.154.81 'cd /opt/plumo-cs/app && git rev-parse HEAD 2>/dev/null || cat .deployed-sha 2>/dev/null'
```

Build the first image from **exactly what is running now**. The point of step one is to prove the container runs the same code the host does — introducing new code at the same time destroys that proof.

---

## 5. Phase 1 — a Dockerfile that matches production

Replace the scaffolded `backend/Dockerfile`. Requirements:

- **`node:22-alpine`**, matching the host. A runtime version change and a containerisation change at once is two variables.
- Multi-stage: build stage runs `npm ci` + `prisma generate` + `npm run build`; runtime stage carries `dist/`, `node_modules` (production only), and `prisma/`.
- **`npm ci --omit=dev`** in the runtime stage. Prisma's generated client must be copied from the build stage, not regenerated.
- **Run as a non-root UID**, not the default root. This replaces `User=ubuntu`.
- One image, two commands — `node dist/main.js` and `node dist/worker.js` — exactly as the two systemd units do today. Do not build two images.
- `.dockerignore` covering `node_modules`, `.env`, `dist`, `.git`. Secrets must never enter a layer.

Verification: `docker run` the image with `--entrypoint sh` and confirm `dist/main.js` and the generated Prisma client are present and the Node version is 22.

---

## 6. Phase 2 — compose, networking, and the hardening you already have

The single genuinely tricky part is **how a container reaches the host's Postgres and Redis.**

Options, in order of preference:

1. **`network_mode: host`** — the container shares the host network namespace. `DATABASE_URL` keeps pointing at `localhost:5432`, nginx keeps proxying to `127.0.0.1:3002`, and `pg_hba.conf` needs no change at all. Simplest, fewest moving parts, and on a single-purpose host the isolation you give up is close to nothing.
2. **Bridge network + `extra_hosts: host.docker.internal:host-gateway`** — more conventional, but requires opening `pg_hba.conf` to the Docker bridge subnet. That is a widening of database access and must be a deliberate decision, not a side effect.

**Recommendation: option 1 for the first cutover.** It changes the fewest things at once. Revisit later if you ever run more than this app on the box.

Whichever you choose, the compose file must reproduce the systemd hardening — containers are not automatically safer:

| systemd today | compose equivalent |
|---|---|
| `User=ubuntu` | non-root `USER` in the image |
| `NoNewPrivileges=true` | `security_opt: [no-new-privileges:true]` |
| `ProtectSystem=strict` | `read_only: true` |
| `PrivateTmp=true` | `tmpfs: [/tmp]` |
| `Restart=always` | `restart: unless-stopped` |
| (nothing) | `cap_drop: [ALL]` — a straight improvement |

Also carry over:

- **Env from file, never baked in**: `env_file: /opt/plumo-cs/app/.env`, which stays owned by `ubuntu` and `chmod 600`.
- **Log rotation.** Today logs go to journald, which rotates. Docker's default `json-file` driver does **not** — it grows until the disk is full. Set `logging.options.max-size` and `max-file` on both services. This is the single most common way a dockerised deploy takes itself down months later.
- **Healthchecks** on the API, so `docker compose ps` tells the truth.

---

## 7. Phase 3 — migrations as an explicit step

Today migrations run by hand. In the container world they become a distinct one-shot that runs **before** the new version serves traffic:

```bash
docker compose run --rm migrate
```

- That service runs `npx prisma migrate deploy` using **`MIGRATE_DATABASE_URL`** (the `plumo_migrator` role), while `api` and `worker` use `DATABASE_URL` (`plumo_app`). Keeping the two roles distinct in compose is what preserves the property that the runtime cannot alter schema.
- It must **exit non-zero on failure** and abort the deploy. A deploy that migrates halfway and starts anyway is worse than one that stops.
- Remember `20260806120000_chat_updates_feed_index` creates a **partial index Prisma cannot represent**. `prisma migrate deploy` applies it correctly; `prisma migrate diff` will propose dropping it. Never generate a migration from a diff without reading it.

---

## 8. Phase 4 — cutover, and how to undo it

Cutover is deliberately boring and reversible:

1. Take a fresh dump (§3).
2. Build and tag the image with the **git SHA**, never `latest`. `latest` makes rollback ambiguous at the exact moment you need it to be obvious.
3. `docker compose run --rm migrate` — for the first cutover this should be a no-op, since you're building the already-deployed commit.
4. `systemctl stop plumo-api plumo-worker` and **`systemctl disable`** them, so a reboot doesn't start a second copy fighting the container for port 3002.
5. `docker compose up -d`.
6. Verify: `curl -sf https://csapi.plumo.work/health`; confirm the 4hacks poller is still getting `200`s on `/chat/updates`; watch `docker compose logs -f` for a few minutes.

**Rollback**, if anything looks wrong:

```bash
docker compose down && systemctl enable --now plumo-api plumo-worker
```

The host install stays in place, untouched, for at least one full week after cutover. Delete it only once you've had a boring week — and a reboot — on containers.

---

## 9. Phase 5 — build off the server (later, not now)

Building on the production host is acceptable to start (16 GB RAM, 53 GB free) and keeps the first cutover simple. It is not where this should end up:

- Build in CI on push, push to GHCR, and have the server only ever `pull` a tag.
- This repo currently has **no backend CI at all** — the 30 broken type errors on `main` are proof that nothing checks. CI that runs `tsc --noEmit` and `npm test` is worth more than the containerisation itself, and containers make it natural: the thing CI builds is the thing that runs.

---

## 10. Why this ordering, and what it buys the tenancy cutover

Phase 2b + 3 must ship as a **single deployment** — the migration drops `users.role` and `users.team_id`, so the moment it applies, the current build is broken. That is the highest-risk change in this project's future, and today the only way back is rebuilding from an older commit on the host and hoping.

Do this first and that cutover becomes: run the migration, start the new tag, and if the isolation proofs fail, `docker compose up -d` the previous SHA. Minutes instead of an outage.

So the sequence is: **backups → containerise → CI → tenancy cutover.** Dockerising is not a detour from Phase 2b; it is the safety net you want under it.

---

## 11. If you want Postgres containerised too

Deliberately separated, because I don't recommend it and the decision should be explicit.

What would have to be true first:

- A **named volume with an explicit `driver_opts` bind** to a path outside the Docker tree, so `docker compose down -v` cannot orbit the data.
- `roles.sql` re-provisioned inside the container image's init path, reproducing `plumo_app` / `plumo_migrator` exactly — including `NOSUPERUSER` and `NOBYPASSRLS`. Getting this wrong silently disables RLS, which is precisely the failure mode Phase 2 was built to prevent, and it fails **open**.
- A documented `pg_upgrade` procedure across image versions, tested on a copy.
- The backup cron rewritten to `docker compose exec`.
- Postgres **18** specifically, matching what runs today. Not `postgres:16-alpine` from the dev compose file.

That is a week of careful work whose payoff is "the database is in a container". The stateless services give you nearly all the deployment benefit for a fraction of the risk. My advice is to do §2–§9, run it for a month, and revisit this only if a concrete problem asks for it.

---

## 12. Open decisions

1. **Host networking or bridge + `pg_hba` change?** (I recommend host for cutover one.)
2. **Postgres containerised?** (I recommend no — see §11.)
3. **Blue/green for the API**, or accept a ~2 second restart gap? Currently a deploy already drops connections, so this is not a regression — but two containers behind an nginx upstream would remove it.
4. **Where does the image live** — build on host now, or set up GHCR immediately?
5. **Does the backup work happen first?** (I would treat this as non-negotiable rather than a decision.)
