import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Principal, SCOPES_KEY } from '../decorators';
import { roleAtLeast, Role } from '../permissions';

/**
 * §8.6 steps 2–3: coarse role gate for humans, scope gate for machines.
 * Roles are hierarchical (lead ⊇ agent, admin ⊇ lead); scopes never inherit.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    const scopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [ctx.getHandler(), ctx.getClass()]);

    const req = ctx.switchToHttp().getRequest();
    const principal: Principal | undefined = req.principal;
    if (!principal) return true; // public route

    if (principal.kind === 'api_key') {
      if (!scopes || scopes.length === 0) {
        // Route defines no machine scope — humans only by construction.
        if (roles && roles.length > 0) throw new ForbiddenException('This route is human-only');
        return true;
      }
      const granted = principal.scopes ?? [];
      const ok = scopes.every((s) => granted.includes(s));
      if (!ok) throw new ForbiddenException('API key missing required scope');
      return true;
    }

    // human
    if (!roles || roles.length === 0) return true;
    const min = roles.reduce((lowest, r) => (roleAtLeast(lowest, r) ? r : lowest), roles[0]);
    if (!roleAtLeast(principal.role as Role, min)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
