import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QueueProducer } from '../queue/queue.producer';

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
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Incorrect email or password');
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw new UnauthorizedException('Incorrect email or password');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    return this.issueTokens(user);
  }

  /** Refresh-token rotation: verify hash, revoke old, issue new pair. */
  async refresh(refreshToken: string) {
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
    return this.issueTokens(user);
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

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true, teamId: true,
        availability: true, avatarUrl: true, lastActiveAt: true, createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
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

  private async issueTokens(user: { id: string; email: string; name: string; role: string; teamId: string | null }) {
    const accessTtl = this.config.get<string>('jwt.accessTtl') ?? '15m';
    const refreshTtl = this.config.get<string>('jwt.refreshTtl') ?? '30d';

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, teamId: user.teamId, name: user.name },
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
      user: { id: user.id, email: user.email, name: user.name, role: user.role, teamId: user.teamId },
    };
  }
}
