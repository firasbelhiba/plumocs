import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY, SCOPES_KEY, type Principal } from '../decorators';

/** §8.6 steps 2–3: hierarchical roles for humans, literal scopes for machines. */
describe('RolesGuard', () => {
  function makeGuard(meta: { roles?: string[]; scopes?: string[] }) {
    const reflector = {
      getAllAndOverride: (key: string) => (key === ROLES_KEY ? meta.roles : key === SCOPES_KEY ? meta.scopes : undefined),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  const ctxFor = (principal: Principal | undefined) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ principal }) }), getHandler: () => null, getClass: () => null }) as unknown as ExecutionContext;

  const agent: Principal = { kind: 'user', workspaceId: 'w1', id: 'a', role: 'agent', teamId: 't1' };
  const lead: Principal = { kind: 'user', workspaceId: 'w1', id: 'l', role: 'lead', teamId: 't1' };
  const admin: Principal = { kind: 'user', workspaceId: 'w1', id: 'ad', role: 'admin', teamId: 't1' };

  it('lets public routes through (no principal)', () => {
    expect(makeGuard({ roles: ['admin'] }).canActivate(ctxFor(undefined))).toBe(true);
  });

  it('ungated routes accept any authenticated human', () => {
    expect(makeGuard({}).canActivate(ctxFor(agent))).toBe(true);
  });

  describe('role hierarchy', () => {
    it('@Roles("lead") admits leads and admins, refuses agents', () => {
      const guard = makeGuard({ roles: ['lead'] });
      expect(guard.canActivate(ctxFor(lead))).toBe(true);
      expect(guard.canActivate(ctxFor(admin))).toBe(true);
      expect(() => guard.canActivate(ctxFor(agent))).toThrow(ForbiddenException);
    });

    it('@Roles("admin") admits only admins', () => {
      const guard = makeGuard({ roles: ['admin'] });
      expect(guard.canActivate(ctxFor(admin))).toBe(true);
      expect(() => guard.canActivate(ctxFor(lead))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctxFor(agent))).toThrow(ForbiddenException);
    });

    it('@Roles("agent") admits everyone (lowest rung)', () => {
      const guard = makeGuard({ roles: ['agent'] });
      for (const p of [agent, lead, admin]) expect(guard.canActivate(ctxFor(p))).toBe(true);
    });
  });

  describe('machine principals', () => {
    const key = (scopes: string[]): Principal => ({ kind: 'api_key', workspaceId: 'w1', id: 'k', scopes });

    it('grants a key holding the required scope', () => {
      const guard = makeGuard({ scopes: ['tickets:write'] });
      expect(guard.canActivate(ctxFor(key(['tickets:read', 'tickets:write'])))).toBe(true);
    });

    it('refuses a key missing any required scope', () => {
      const guard = makeGuard({ scopes: ['tickets:write'] });
      expect(() => guard.canActivate(ctxFor(key(['tickets:read'])))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctxFor(key([])))).toThrow(ForbiddenException);
    });

    it('requires ALL listed scopes, not just one', () => {
      const guard = makeGuard({ scopes: ['tickets:read', 'exports:run'] });
      expect(() => guard.canActivate(ctxFor(key(['tickets:read'])))).toThrow(ForbiddenException);
      expect(guard.canActivate(ctxFor(key(['tickets:read', 'exports:run'])))).toBe(true);
    });

    it('keeps machines out of human-only routes (roles but no scopes)', () => {
      const guard = makeGuard({ roles: ['admin'] });
      expect(() => guard.canActivate(ctxFor(key(['tickets:read'])))).toThrow(ForbiddenException);
    });

    it('scopes never inherit — a write scope does not imply read', () => {
      const guard = makeGuard({ scopes: ['tickets:read'] });
      expect(() => guard.canActivate(ctxFor(key(['tickets:write'])))).toThrow(ForbiddenException);
    });
  });
});
