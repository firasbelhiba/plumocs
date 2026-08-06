import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { ALLOW_API_KEY, IS_PUBLIC_KEY, Principal } from '../decorators';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

/**
 * Establishes the principal for every request (§8.6 step 1):
 * a user via `Authorization: Bearer <jwt>` or a machine via `X-Api-Key`.
 * 401 if neither. API keys are only accepted on routes marked @AllowApiKey.
 *
 * Since the tenancy migration this also establishes the WORKSPACE, and the two
 * are one step rather than two on purpose: there is no such thing as an
 * authenticated request that is not inside a tenant, and a principal that
 * existed briefly without one would be a principal some code path could use.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly workspaces: WorkspaceContextService,
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

    let payload: { sub: string; name?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // DELIBERATELY OUTSIDE THE try ABOVE. The membership lookup throws 403, and
    // a 403 swallowed by that catch would be re-thrown as "invalid or expired
    // token" — sending the console into a logout/login loop over a credential
    // that is perfectly valid.
    //
    // Also deliberately a per-request database read rather than a JWT claim.
    // Role and team are per-workspace now, so a role baked into a 15-minute
    // token is the wrong role the moment the user switches desks — and a
    // membership revoked at 10:00 would keep working until 10:15. The cost is
    // one indexed lookup; the alternative is an authority cache, which is the
    // same staleness wearing a different hat.
    const membership = await this.workspaces.resolveForUser(
      payload.sub,
      this.workspaces.slugFromHeaders(headers),
    );

    const principal: Principal = {
      kind: 'user',
      id: payload.sub,
      workspaceId: membership.workspaceId,
      role: membership.role,
      teamId: membership.teamId,
      name: payload.name,
    };
    req.principal = principal;
    return true;
  }

  private async verifyApiKey(secret: string): Promise<Principal> {
    const prefix = secret.slice(0, 12);
    const hash = createHash('sha256').update(secret).digest('hex');
    // Resolved through app_resolve_api_key rather than prisma.apiKey.findFirst:
    // guards run before any transaction exists, so this query has no workspace
    // bound and a plain SELECT would return nothing once Phase 3 lands.
    const key = await this.workspaces.resolveApiKey(prefix, hash);
    if (!key) throw new UnauthorizedException('Invalid API key');
    // Expiry is checked here rather than in the query so an expired key gets a
    // distinguishable message: a partner whose credential lapsed needs to know
    // to rotate it, not to go hunting for a typo in a key that is actually fine.
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('This API key has expired');
    }
    // fire-and-forget usage stamp
    this.workspaces.touchApiKey(key.id).catch(() => undefined);
    // The key names its own tenant — a machine caller never sends the slug
    // header, and could not be trusted with it if it did.
    // teamId confines the key to one team's rows (see TeamScopeService)
    return {
      kind: 'api_key',
      id: key.id,
      workspaceId: key.workspaceId,
      name: key.name,
      scopes: key.scopes,
      teamId: key.teamId,
    };
  }
}
