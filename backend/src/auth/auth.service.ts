import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QueueProducer } from '../queue/queue.producer';
import { Principal } from '../common/decorators';
import { ResolvedMembership, WorkspaceContextService } from '../common/workspace/workspace-context.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 15 * 60_000;
  const n = parseInt(m[1], 10);
  return n * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

/**
 * The PM roles that carry a support desk.
 *
 * Taken from PM's own role catalog (workspace-role-catalog.contract.ts), where
 * P0 "owner" and P1 "admin" are BOTH defined as `allPermissions(true, true)`.
 * They run the workspace, so they run its desk. P2 "member" and P3 "viewer"
 * hold only `scopedPermissions(...)` and must not reach a desk this way.
 *
 * An explicit allow-list rather than PM's `canWrite` flag: canWrite means "can
 * edit something in this workspace", and a member who can move a task has no
 * business reading every customer conversation the organisation has ever had.
 * If PM adds a role, the safe default is that it lands OUTSIDE this set.
 */
const PM_DESK_ADMIN_ROLES: ReadonlySet<string> = new Set(['P0', 'P1']);

/**
 * Slugs the schema refuses, duplicated from the workspaces_slug_reserved CHECK.
 *
 * Kept in TypeScript on purpose rather than relying on the constraint: hitting a
 * CHECK aborts the whole transaction, and provisioning needs to reject a
 * candidate cheaply and try the next one. The constraint remains the backstop —
 * this list is the control.
 */
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'api', 'app', 'www', 'admin', 'auth', 'health', 'static',
  'assets', 'docs', 'status', 'webhooks', 'w', 'login', 'signup',
]);

/**
 * Turn a PM workspace name or slug into something workspaces_slug_format will
 * accept, or null when nothing usable survives.
 *
 * The trailing-hyphen strip happens TWICE by necessity: slicing to 32 can cut
 * mid-word and re-introduce one, which is how "Acme, Inc." would otherwise
 * become "acme-inc-" and violate the format CHECK.
 */
export function slugify(raw: string): string | null {
  const s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Café → Cafe
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) // 32, not the column's limit: leaves room for a "-2" suffix
    .replace(/-+$/g, '');
  return s.length >= 1 && !RESERVED_SLUGS.has(s) ? s : null;
}

/**
 * Slug candidates for a new desk, best first.
 *
 * PM's own slug is preferred over its name so that a desk provisioned
 * automatically is indistinguishable from one linked by hand, which matched on
 * slug equality across the two products.
 *
 * The last entry cannot fail and is why this returns a non-empty list: a Mongo
 * ObjectId tail is [0-9a-f]{8}, so `desk-a1b2c3d4` always satisfies the format
 * CHECK, is never reserved and is never empty — the answer for an organisation
 * whose name is entirely non-Latin.
 */
export function slugCandidates(pmSlug: string, pmName: string, pmWorkspaceId: string): string[] {
  const bases = [slugify(pmSlug), slugify(pmName)].filter((s): s is string => s !== null);
  const out: string[] = [];
  for (const b of bases) if (!out.includes(b)) out.push(b);
  // Suffixes only for the best base — a desk called "acme-2" is already an
  // admission that "acme" was taken, and trying "acme-inc-2" as well adds noise
  // without adding a meaningfully different name.
  if (bases.length > 0) for (let n = 2; n <= 5; n++) out.push(`${bases[0]}-${n}`);
  out.push(`desk-${pmWorkspaceId.slice(-8)}`);
  return out;
}

/**
 * The subset of PM's /userinfo this service needs. Declared structurally rather
 * than imported from PmIdentityService so that auth does not depend on the PM
 * module — the dependency already runs the other way.
 */
export interface PmSignInIdentity {
  sub: string;
  email: string;
  name: string;
  workspaces: Array<{ id: string; slug: string; name: string; roleId: string }>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly queue: QueueProducer,
    private readonly workspaces: WorkspaceContextService,
  ) {}

  /**
   * @param workspaceSlug the desk being signed in to, from the X-Workspace-Slug
   *        header. Optional while only one workspace exists.
   */
  async login(email: string, password: string, workspaceSlug?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Incorrect email or password');
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw new UnauthorizedException('Incorrect email or password');

    // Identity is global, authority is per desk — so the membership is resolved
    // here and NOT stored in the token. It is resolved before the tokens are
    // minted because the login response carries role and teamId, which the
    // console builds its navigation from; a session with no desk would render an
    // empty shell rather than an error. Throws 403 when this human has no
    // membership: authentication succeeded, there is simply nothing here for
    // them, and that is a different answer from "wrong password".
    const membership = await this.workspaces.resolveForUser(user.id, workspaceSlug);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    return this.issueTokens(user, membership);
  }

  /**
   * Sign in with a Plumo PM identity.
   *
   * ACCESS IS DECIDED BY THE PM ROLE, not by a pre-existing CS invite. Whoever
   * owns or administers a Plumo workspace owns its support desk, so they can
   * sign in and manage it without anybody provisioning them first. That is the
   * whole point of a shared identity: PM already knows who runs this org.
   *
   * Three gates, in order — each narrows the one before it:
   *
   *   1. ROLE.      P0/P1 in at least one PM workspace. See PM_DESK_ADMIN_ROLES.
   *   2. WORKSPACE. That PM workspace must be linked to a CS desk. A desk opts
   *                 in by carrying the PM workspace id; nothing is implicit.
   *   3. ACCOUNT.   Resolved by PM `sub` alone — see resolvePmUser.
   */
  async loginWithPm(info: PmSignInIdentity, workspaceSlug?: string) {
    // 1. ROLE — which PM workspaces does this human actually run?
    const administered = info.workspaces.filter((w) => PM_DESK_ADMIN_ROLES.has(w.roleId));
    if (administered.length === 0) {
      throw new UnauthorizedException(
        'You are not an owner or admin of any Plumo workspace. Ask an owner to promote you, or sign in with your Plumo CS password.',
      );
    }

    // 2. WORKSPACE — of those, which already have a desk?
    //
    // DELIBERATELY NO `status` FILTER IN THE QUERY. Filtering to active here
    // would hide a suspended desk, the branch below would conclude "no desk
    // exists" and try to create one, and the insert would hit
    // workspaces_pm_workspace_id_key — a 23505 surfacing as a 500 on sign-in.
    // Worse, it would be a way to route around a suspension. Suspension is
    // enforced immediately after, on the fuller picture.
    const linked = await this.prisma.workspace.findMany({
      where: { pmWorkspaceId: { in: administered.map((w) => w.id) } },
      select: { id: true, slug: true, status: true },
      orderBy: { slug: 'asc' },
    });
    const desks = linked.filter((d) => d.status === 'active');

    if (desks.length === 0 && linked.length > 0) {
      throw new UnauthorizedException(
        'That workspace is not currently available. Contact your administrator.',
      );
    }

    // Honour the requested desk when there is one, but never silently redirect
    // to a different desk than the one asked for — that would show an admin a
    // neighbouring organisation's inbox and look like a bug in their favour.
    const matched = workspaceSlug ? desks.find((d) => d.slug === workspaceSlug) : desks[0];
    if (!matched && workspaceSlug) {
      throw new UnauthorizedException('You do not administer that workspace in Plumo');
    }

    // 3. ACCOUNT — resolved here and not earlier on purpose. A refused sign-in
    // must not leave a users row behind, or an unauthenticated endpoint becomes
    // an account-creation primitive.
    const user = await this.resolvePmUser(info);

    let target: { id: string; slug: string };
    if (matched) {
      await this.ensureDeskMembership(user.id, matched.id);
      target = matched;
    } else {
      if (!this.config.get<boolean>('pm.autoProvisionDesks')) {
        throw new UnauthorizedException(
          `No Plumo CS desk is connected to ${administered.map((w) => w.name).join(', ')} yet.`,
        );
      }

      // Sorted by name so the choice is deterministic rather than dependent on
      // the order PM happened to return. Someone who administers several
      // desk-less organisations gets a desk for one of them here; signing in
      // again lands on that desk rather than provisioning the next, so the rest
      // are created deliberately from Settings. That is the intended asymmetry —
      // sign-in should open a desk, not spawn an estate of them.
      const org = [...administered].sort((a, b) => a.name.localeCompare(b.name))[0];
      target = await this.provisionDesk(org, user.id);
    }

    // Re-resolved through the normal path rather than trusted from above, so a
    // desk-level suspension is enforced identically no matter how you signed in.
    const membership = await this.workspaces.resolveForUser(user.id, target.slug);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    return this.issueTokens(user, membership);
  }

  /**
   * Find the CS account for a PM identity, or provision one.
   *
   * MATCHED ON `sub` AND NEVER ON EMAIL. PM emails are mutable and CS emails
   * are user-supplied, so adopting an account by email would let anyone who can
   * set their PM address to a CS admin's — and who owns any linked workspace of
   * their own — sign in AS that admin and inherit every desk they belong to.
   * The `@unique` on users.pm_user_id is the same rule at the database level.
   *
   * So a colliding email is refused rather than merged. The refusal is
   * actionable: signing in with the password once and linking from Settings
   * proves possession of both accounts, which is exactly what is missing here.
   */
  private async resolvePmUser(info: PmSignInIdentity) {
    const linked = await this.prisma.user.findFirst({ where: { pmUserId: info.sub } });
    if (linked) {
      if (!linked.isActive) throw new UnauthorizedException('This Plumo CS account has been disabled');
      return linked;
    }

    const emailTaken = await this.prisma.user.findUnique({
      where: { email: info.email },
      select: { id: true },
    });
    if (emailTaken) {
      throw new UnauthorizedException(
        'A Plumo CS account already uses this email address. Sign in with your password once and connect Plumo from Settings — that links the two accounts safely.',
      );
    }

    return this.prisma.user.create({
      data: {
        email: info.email,
        name: info.name || info.email,
        // This account signs in through Plumo and has no password. A real argon2
        // hash of 32 random bytes rather than a sentinel string, so the ordinary
        // argon2.verify path stays valid and simply can never match.
        passwordHash: await argon2.hash(randomBytes(32).toString('hex')),
        pmUserId: info.sub,
      },
    });
  }

  /**
   * Create a desk for a PM organisation that has none, and seat its owner.
   *
   * Tries slug candidates in order because `workspaces.slug` is unique and two
   * unrelated PM organisations may both be called "Acme". The identity of a desk
   * is `pm_workspace_id`, never the slug — the slug is only a label, and the
   * last candidate is a deterministic `desk-<id tail>` that cannot collide with
   * a human-chosen name and cannot fail the format CHECK.
   */
  private async provisionDesk(
    org: { id: string; slug: string; name: string },
    userId: string,
  ): Promise<{ id: string; slug: string }> {
    for (const slug of slugCandidates(org.slug, org.name, org.id)) {
      try {
        return await this.createDesk(slug, org, userId);
      } catch (err) {
        // Only a SLUG collision is retryable. A pm_workspace_id collision cannot
        // reach here — it is absorbed by ON CONFLICT DO NOTHING below — so a
        // duplicate key at this point means the name is taken by an unrelated
        // desk and the next candidate is the correct response.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('23505') || msg.toLowerCase().includes('unique constraint')) continue;
        throw err;
      }
    }
    throw new ServiceUnavailableException('Could not create a workspace for your organisation. Please try again.');
  }

  /** One attempt at one slug. Everything or nothing. */
  private async createDesk(
    slug: string,
    org: { id: string; name: string; slug: string },
    userId: string,
  ): Promise<{ id: string; slug: string }> {
    return this.prisma.$transaction(async (tx) => {
      // `workspaces` is the one table with NO row-level security — the Phase-3
      // migration derives its list from "has a workspace_id column", and this
      // table is keyed on `id`. So this insert needs no binding, and plumo_app
      // holds an unfiltered INSERT on it. Everything after the bind does not.
      //
      // ON CONFLICT rather than read-then-write is what makes two browser tabs
      // safe. The predicate is repeated in the inference clause because the index
      // is PARTIAL and Postgres will not match it otherwise.
      const created = (await tx.$queryRaw(Prisma.sql`
        INSERT INTO workspaces (slug, name, pm_workspace_id)
        VALUES (${slug}::citext, ${org.name}, ${org.id})
        ON CONFLICT (pm_workspace_id) WHERE pm_workspace_id IS NOT NULL DO NOTHING
        RETURNING id, slug
      `)) as Array<{ id: string; slug: string }>;

      // Lost the race: another request provisioned this organisation moments
      // ago. Adopt theirs and seed nothing — their transaction already did, and
      // duplicating the seed would give the desk two "Support" teams.
      if (created.length === 0) {
        const existing = (await tx.$queryRaw(Prisma.sql`
          SELECT id, slug, status::text FROM workspaces WHERE pm_workspace_id = ${org.id}
        `)) as Array<{ id: string; slug: string; status: string }>;
        const row = existing[0];
        if (!row) throw new ServiceUnavailableException('Could not create a workspace for your organisation.');
        if (row.status !== 'active') {
          throw new UnauthorizedException('That workspace is not currently available. Contact your administrator.');
        }
        await this.seatOn(tx, row.id, userId);
        return { id: row.id, slug: row.slug };
      }

      const desk = created[0];

      // The ticket-number sequence already exists: workspaces_number_sequence_trigger
      // fired on the INSERT above. Nothing to do for it here.

      // Everything below is workspace-scoped and under RLS, so bind first or the
      // inserts are rejected. Each model defaults workspace_id to
      // app_current_workspace(), which is why none of them pass it explicitly.
      await tx.$executeRaw`SELECT app_set_workspace(${desk.id}::uuid)`;

      // A desk with no team is not merely empty, it is broken on the second
      // hire: routing leaves teamId null and TeamScopeService then refuses every
      // lead and agent, while their inbox renders silently empty. The founding
      // admin would never notice.
      const team = await tx.team.create({
        data: { name: 'Support', description: 'General support' },
        select: { id: true },
      });

      // One policy per priority. A priority with no active policy yields a null
      // due date, and everything downstream then fails as SILENCE — the breach
      // sweep never matches, so no breach tags, no notifications, no webhooks,
      // and a permanently empty "breaching" view that looks like good news.
      //
      // businessHoursId stays null: we do not know this organisation's timezone,
      // and inventing one would make every clock subtly wrong.
      await tx.slaPolicy.createMany({
        data: [
          { name: 'Standard', priority: 'low', firstResponseMins: 240, resolutionMins: 1440 },
          { name: 'Standard', priority: 'normal', firstResponseMins: 240, resolutionMins: 1440 },
          { name: 'Priority', priority: 'high', firstResponseMins: 60, resolutionMins: 480 },
          { name: 'Urgent', priority: 'urgent', firstResponseMins: 15, resolutionMins: 240 },
        ],
      });

      await this.seatOn(tx, desk.id, userId, team.id);

      // Written after the bind because audit_log is itself workspace-scoped.
      await tx.auditLog.create({
        data: {
          actorType: 'user',
          actorId: userId,
          entityType: 'workspace',
          entityId: desk.id,
          action: 'workspace.provisioned',
          diffJson: { pmWorkspaceId: org.id, pmSlug: org.slug, slug: desk.slug, viaPmSignIn: true },
        },
      });

      this.logger.log(`Provisioned desk "${desk.slug}" for PM workspace ${org.slug} (${org.id})`);
      return { id: desk.id, slug: desk.slug };
    });
  }

  /**
   * Seat a user on a desk as admin, inside an already-bound transaction.
   *
   * `role` is passed explicitly because the column defaults to 'agent' — the
   * person who brought this desk into existence must not land in it unable to
   * configure it.
   *
   * With one member, round-robin assigns every ticket to them. That is correct
   * for a one-person desk and should not be mistaken later for a routing bug.
   */
  private async seatOn(
    tx: Pick<PrismaService, 'workspaceMembership'>,
    workspaceId: string,
    userId: string,
    teamId?: string,
  ) {
    const existing = await tx.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (existing) return;
    await tx.workspaceMembership.create({ data: { workspaceId, userId, role: 'admin', teamId } });
  }

  /**
   * Give a PM owner/admin a seat on the desk, if they do not already have one.
   *
   * CREATE-IF-MISSING, NEVER UPDATE. If a membership already exists it is left
   * exactly as CS set it: an admin who deliberately demoted somebody to `agent`,
   * or deactivated them on this desk, must not have that quietly undone by the
   * next Plumo sign-in. PM decides who may enter; CS keeps deciding what they
   * can do once inside.
   */
  private async ensureDeskMembership(userId: string, workspaceId: string) {
    await this.prisma.$transaction(async (tx) => {
      // workspace_memberships is RLS-protected and its policy demands
      // `workspace_id = app_current_workspace()`, which nothing has bound this
      // early in a login — so bind it here. Both the read and the write below
      // would otherwise be invisible/rejected. set_config is transaction-local,
      // so this cannot leak onto the next request sharing the connection.
      await tx.$executeRaw`SELECT app_set_workspace(${workspaceId}::uuid)`;

      const existing = await tx.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { id: true },
      });
      if (existing) return;

      await tx.workspaceMembership.create({
        data: { workspaceId, userId, role: 'admin' },
      });
    });
  }

  /** Refresh-token rotation: verify hash, revoke old, issue new pair. */
  async refresh(refreshToken: string, workspaceSlug?: string) {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const row = await this.prisma.refreshToken.findFirst({
      where: { id: payload.jti, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row || row.tokenHash !== sha256(refreshToken)) {
      throw new UnauthorizedException('Refresh token revoked or unknown');
    }
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('User disabled');
    // Re-resolved on every refresh, not carried over from the previous pair: a
    // membership revoked or downgraded mid-session must not be renewed by it.
    const membership = await this.workspaces.resolveForUser(user.id, workspaceSlug);
    return this.issueTokens(user, membership);
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ jti: string }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      await this.prisma.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      /* logging out with a bad token is a no-op */
    }
    return { ok: true };
  }

  async me(principal: Principal) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.id },
      select: {
        id: true, email: true, name: true,
        avatarUrl: true, lastActiveAt: true, createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException();

    // Same response shape as before, assembled from two rows instead of one:
    // role, teamId and availability are per-desk. role/teamId are already on the
    // principal — AuthGuard resolved them for THIS workspace — so only
    // availability needs the membership row, and reading it by the composite key
    // is what keeps a second desk's shift state from leaking in here.
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: principal.workspaceId, userId: principal.id } },
      select: { availability: true },
    });
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: principal.workspaceId },
      select: { slug: true },
    });

    return {
      ...user,
      role: principal.role,
      teamId: principal.teamId ?? null,
      availability: membership?.availability ?? 'available',
      // Also on /me, so a console restored from a stored token — which never
      // saw the login response — can still learn its workspace.
      workspace: { id: principal.workspaceId, slug: workspace?.slug ?? null },
    };
  }

  /** Always answers 200 — never leaks whether the address exists. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      // The CONSOLE's origin, not appUrl. appUrl is this api — csapi.plumo.work
      // in production — which serves no pages, so every reset link ever emailed
      // 404'd for every user who clicked one.
      const consoleUrl = this.config.get<string>('consoleUrl');

      // Both branches enqueue kind: 'password_reset' and nothing else. It is the
      // ONLY kind the fanout processor handles before requireWorkspace, because
      // forgot-password is unauthenticated and arrives with no workspace bound.
      // A tidier-sounding kind for the branch below would fail requireWorkspace
      // and retry to exhaustion, and the person would simply never hear back.
      if (user.pmUserId) {
        // NO TOKEN FOR AN ACCOUNT THAT SIGNS IN THROUGH PLUMO.
        //
        // loginWithPm re-checks the PM role, the desk link and the desk status on
        // every single sign-in. login() checks none of them, and cannot: CS has
        // no way to ask PM about a `sub` without that person's own token. So a
        // password on one of these accounts is a credential that survives being
        // demoted, being removed from the PM workspace, and having the PM account
        // disabled — permanently, and on a desk auto-provisioned by one admin's
        // first sign-in that person is the only admin there is. Refusing to mint
        // one keeps "PM decides who may enter" true at every sign-in rather than
        // only the first.
        //
        // WHY THIS IS SAID IN THE MAIL AND NOT IN THE RESPONSE: the response
        // below stays a uniform { ok: true } for every address, known or not.
        // Delivery already proves the reader holds the mailbox, so telling THEM
        // how the account signs in reveals nothing they could not learn by
        // signing in. The same sentence in the HTTP response would hand an
        // anonymous caller an account-enumeration oracle.
        //
        // `pmUserId` OVER-MATCHES, KNOWINGLY. It is also set on an account that
        // had a CS password first and linked Plumo later from Settings; those
        // people lose password RECOVERY, keeping password sign-in and
        // change-password for as long as they remember the password. Telling the
        // two populations apart means recording whether a password was ever
        // deliberately set — a new nullable column, because a provisioned
        // account's passwordHash is an argon2 hash of random bytes and is
        // deliberately indistinguishable from a real one. That column is worth
        // adding; it is not worth blocking this on, because the failure it
        // prevents is a revoked admin holding a permanent session and the failure
        // it causes is a linked admin asking a colleague for help.
        this.queue.notify({
          kind: 'password_reset',
          userIds: [user.id],
          text: [
            'This account signs in through Plumo, so there is no password to reset.',
            '',
            `Open ${consoleUrl} and choose "Continue with Plumo".`,
            '',
            'If you did not ask for this, you can ignore it — nothing has changed.',
          ].join('\n'),
          email: true,
        });
      } else {
        const token = randomBytes(32).toString('hex');
        await this.prisma.passwordReset.create({
          data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3_600_000) },
        });
        // Delivered via the notifications fanout (worker sends the email).
        this.queue.notify({
          kind: 'password_reset',
          userIds: [user.id],
          text: `Reset link: ${consoleUrl}/reset-password?token=${token}`,
          email: true,
        });
      }
    }
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const row = await this.prisma.passwordReset.findFirst({
      where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new UnauthorizedException('Reset link is invalid or expired');

    // The same refusal forgotPassword now makes, repeated at the point of use.
    // Tokens minted before that shipped stay valid for up to an hour, so without
    // this the deploy that closes the path leaves it open for one more hour —
    // and it is a standing bypass of every PM gate, not a cosmetic one.
    //
    // Says why, unlike the generic refusal above: reaching this line takes a live
    // token, which takes the mailbox, so there is nobody here to enumerate to.
    // The row is left to expire rather than burned — it grants nothing now.
    const owner = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: { pmUserId: true },
    });
    if (owner?.pmUserId) {
      throw new UnauthorizedException(
        'This account signs in through Plumo — use "Continue with Plumo" on the sign-in screen instead of a password.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await argon2.hash(newPassword) },
      }),
      // a password change revokes every open session
      this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  /** Authenticated password change — verifies the current password first. */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await argon2.hash(newPassword) },
      }),
      // other sessions are revoked; the caller keeps its access token until expiry
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  private async issueTokens(
    user: { id: string; email: string; name: string },
    membership: ResolvedMembership,
  ) {
    const accessTtl = this.config.get<string>('jwt.accessTtl') ?? '15m';
    const refreshTtl = this.config.get<string>('jwt.refreshTtl') ?? '30d';

    // role and teamId are NO LONGER CLAIMS. They are per-workspace, and a token
    // is not: the same human holding this token can address a second desk with a
    // different role on the next request. AuthGuard re-resolves both from the
    // membership every time. They stay in the response body below because that
    // is the console's bootstrap payload, not a credential.
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, name: user.name },
      { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );

    const row = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'pending',
        expiresAt: new Date(Date.now() + ttlToMs(refreshTtl)),
      },
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: row.id },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: refreshTtl },
    );
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { tokenHash: sha256(refreshToken) } });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: membership.role,
        teamId: membership.teamId,
      },
      // Which desk this session is on. The console stores the slug and sends it
      // back as X-Workspace-Slug on every subsequent request, so it stops
      // relying on the server guessing "the only workspace" — a guess that
      // stops working, for everyone at once, the day a second one is created.
      workspace: {
        id: membership.workspaceId,
        slug: membership.workspaceSlug,
      },
    };
  }
}
