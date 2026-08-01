import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ALLOW_API_KEY, IS_PUBLIC_KEY, Principal } from '../decorators';

/**
 * Establishes the principal for every request (§8.6 step 1):
 * a user via `Authorization: Bearer <jwt>` or a machine via `X-Api-Key`.
 * 401 if neither. API keys are only accepted on routes marked @AllowApiKey.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const headers = req.headers ?? {};

    const apiKey = headers['x-api-key'] as string | undefined;
    if (apiKey) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_API_KEY, [ctx.getHandler(), ctx.getClass()]);
      if (!allowed) throw new UnauthorizedException('API keys are not accepted on this route');
      req.principal = await this.verifyApiKey(apiKey);
      return true;
    }

    const auth = (headers['authorization'] as string | undefined) ?? '';
    const [scheme, token] = auth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Missing credentials');
    }
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      const principal: Principal = {
        kind: 'user',
        id: payload.sub,
        role: payload.role,
        teamId: payload.teamId ?? null,
        name: payload.name,
      };
      req.principal = principal;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async verifyApiKey(secret: string): Promise<Principal> {
    const prefix = secret.slice(0, 12);
    const hash = createHash('sha256').update(secret).digest('hex');
    const key = await this.prisma.apiKey.findFirst({
      where: { keyPrefix: prefix, keyHash: hash, isActive: true },
    });
    if (!key) throw new UnauthorizedException('Invalid API key');
    // Expiry is checked here rather than in the query so an expired key gets a
    // distinguishable message: a partner whose credential lapsed needs to know
    // to rotate it, not to go hunting for a typo in a key that is actually fine.
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('This API key has expired');
    }
    // fire-and-forget usage stamp
    this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    // teamId confines the key to one team's rows (see TeamScopeService)
    return { kind: 'api_key', id: key.id, name: key.name, scopes: key.scopes, teamId: key.teamId };
  }
}
