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
