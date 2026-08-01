import { ForbiddenException } from '@nestjs/common';
import { NO_TEAM, TeamScopeService } from './team-scope.service';
import type { Principal } from '../decorators';

/**
 * Row-level scoping (§8.4). These are regression guards for a real defect: a
 * `{ teamId: undefined }` fragment is stripped by Prisma and silently degrades
 * to "match every row", which let a team-less lead read the whole instance.
 */
describe('TeamScopeService', () => {
  const scope = new TeamScopeService(null as never);

  const admin: Principal = { kind: 'user', id: 'u-admin', role: 'admin', teamId: 't1' };
  const lead: Principal = { kind: 'user', id: 'u-lead', role: 'lead', teamId: 't1' };
  const agent: Principal = { kind: 'user', id: 'u-agent', role: 'agent', teamId: 't1' };
  const orphanLead: Principal = { kind: 'user', id: 'u-ol', role: 'lead', teamId: null };
  const orphanAgent: Principal = { kind: 'user', id: 'u-oa', role: 'agent', teamId: null };
  const machine: Principal = { kind: 'api_key', id: 'k1', scopes: ['tickets:read'] };

  describe('visibilityWhere', () => {
    it('admins are unrestricted', () => {
      expect(scope.visibilityWhere(admin)).toEqual({});
    });

    it('an unbound key is instance-wide — a deliberate grant', () => {
      expect(scope.visibilityWhere(machine)).toEqual({});
    });

    // regression: every api_key principal used to return {}, so a key issued
    // for one team could read the whole instance
    it('a key bound to a team is confined to it', () => {
      const bound: Principal = { ...machine, teamId: 't1' };
      expect(scope.visibilityWhere(bound)).toEqual({ teamId: 't1' });
    });

    it('a lead is limited to their own team', () => {
      expect(scope.visibilityWhere(lead)).toEqual({ teamId: 't1' });
    });

    it('an agent sees their team or their own assignments', () => {
      expect(scope.visibilityWhere(agent)).toEqual({
        OR: [{ teamId: 't1' }, { assigneeId: 'u-agent' }],
      });
    });

    // the actual bug: undefined would be dropped by Prisma → unfiltered query
    it('a team-less lead gets a closed filter, never an empty one', () => {
      const where = scope.visibilityWhere(orphanLead);
      expect(where).toEqual({ teamId: NO_TEAM });
      expect(where.teamId).toBeDefined();
      expect(Object.keys(where)).toHaveLength(1);
    });

    it('a team-less agent still only reaches their own assignments', () => {
      const where = scope.visibilityWhere(orphanAgent) as { OR: Array<Record<string, unknown>> };
      expect(where.OR[0]).toEqual({ teamId: NO_TEAM });
      expect(where.OR[1]).toEqual({ assigneeId: 'u-oa' });
      // no branch may be an empty object — that would match every row
      for (const branch of where.OR) expect(Object.keys(branch).length).toBeGreaterThan(0);
    });

    it('never emits an undefined value that Prisma would strip', () => {
      for (const p of [lead, agent, orphanLead, orphanAgent]) {
        expect(JSON.stringify(scope.visibilityWhere(p))).not.toContain('undefined');
      }
    });
  });

  describe('assertCanAccess', () => {
    const inTeam = { teamId: 't1', assigneeId: 'someone-else' };
    const otherTeam = { teamId: 't2', assigneeId: 'someone-else' };
    const unrouted = { teamId: null, assigneeId: null };
    const assignedToAgent = { teamId: 't2', assigneeId: 'u-agent' };

    it('admins reach everything, including unrouted work', () => {
      expect(() => scope.assertCanAccess(admin, otherTeam)).not.toThrow();
      expect(() => scope.assertCanAccess(admin, unrouted)).not.toThrow();
    });

    it('an unbound key reaches any team', () => {
      expect(() => scope.assertCanAccess(machine, otherTeam)).not.toThrow();
    });

    it('a bound key is refused outside its team', () => {
      const bound: Principal = { ...machine, teamId: 't1' };
      expect(() => scope.assertCanAccess(bound, inTeam)).not.toThrow();
      expect(() => scope.assertCanAccess(bound, otherTeam)).toThrow(ForbiddenException);
    });

    it('a lead reaches their team and nothing else', () => {
      expect(() => scope.assertCanAccess(lead, inTeam)).not.toThrow();
      expect(() => scope.assertCanAccess(lead, otherTeam)).toThrow(ForbiddenException);
    });

    it('an agent reaches their team or anything assigned to them', () => {
      expect(() => scope.assertCanAccess(agent, inTeam)).not.toThrow();
      expect(() => scope.assertCanAccess(agent, assignedToAgent)).not.toThrow();
      expect(() => scope.assertCanAccess(agent, otherTeam)).toThrow(ForbiddenException);
    });

    it('unrouted tickets stay out of reach for agents and team-less users', () => {
      expect(() => scope.assertCanAccess(agent, unrouted)).toThrow(ForbiddenException);
      expect(() => scope.assertCanAccess(orphanLead, unrouted)).toThrow(ForbiddenException);
      expect(() => scope.assertCanAccess(orphanAgent, unrouted)).toThrow(ForbiddenException);
    });

    it('a null team on both sides is not a match', () => {
      // guards against `null === null` accidentally granting access
      expect(() => scope.assertCanAccess(orphanLead, { teamId: null, assigneeId: 'x' })).toThrow(ForbiddenException);
    });
  });
});
