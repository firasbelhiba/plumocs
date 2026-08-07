import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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

    // 2. WORKSPACE — of those, which have a desk connected? `status: active`
    // deliberately: a suspended desk must not be reachable through a side door
    // that the password login does not have.
    const desks = await this.prisma.workspace.findMany({
      where: { pmWorkspaceId: { in: administered.map((w) => w.id) }, status: 'active' },
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });
    if (desks.length === 0) {
      throw new UnauthorizedException(
        `No Plumo CS desk is connected to ${administered.map((w) => w.name).join(', ')} yet.`,
      );
    }

    // Honour the requested desk when there is one, but never silently redirect
    // to a different desk than the one asked for — that would show an admin a
    // neighbouring organisation's inbox and look like a bug in their favour.
    const target = workspaceSlug ? desks.find((d) => d.slug === workspaceSlug) : desks[0];
    if (!target) {
      throw new UnauthorizedException('You do not administer that workspace in Plumo');
    }

    // 3. ACCOUNT.
    const user = await this.resolvePmUser(info);
    await this.ensureDeskMembership(user.id, target.id);

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
      const token = randomBytes(32).toString('hex');
      await this.prisma.passwordReset.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3_600_000) },
      });
      // Delivered via the notifications fanout (worker sends the email).
      this.queue.notify({
        kind: 'password_reset',
        userIds: [user.id],
        text: `Reset link: ${this.config.get('appUrl')}/reset-password?token=${token}`,
        email: true,
      });
    }
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const row = await this.prisma.passwordReset.findFirst({
      where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new UnauthorizedException('Reset link is invalid or expired');
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
