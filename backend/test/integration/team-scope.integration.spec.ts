import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TeamScopeService } from '../../src/common/guards/team-scope.service';
import { prisma, seedFixture, cleanup, inWorkspace, onlyOurs, asUser, asKey, type Fixture } from './harness';
import type { Principal } from '../../src/common/decorators';

/**
 * Row-level scoping, executed against a real PostgreSQL.
 *
 * The unit suite asserts the *shape* of the where-fragment. That cannot catch a
 * fragment which is well-formed but matches every row — the exact bug that let a
 * team-less lead read the whole instance. These tests assert on rows returned.
 *
 * Team scope is now the INNER of two filters: row-level security confines the
 * query to the principal's workspace first, and this service divides that
 * workspace between its teams. Every read below therefore runs inside the
 * principal's own binding, exactly as WorkspaceBindingInterceptor arranges for a
 * real request. Reading unbound would return zero rows for everybody and turn
 * half of these assertions green for the wrong reason.
 */
jest.setTimeout(30_000);

describe('TeamScopeService (integration)', () => {
  const scope = new TeamScopeService(prisma);
  let f: Fixture;

  beforeAll(async () => { f = await seedFixture(); });
  afterAll(cleanup);

  /** Ticket ids visible to a principal, restricted to this run's fixtures. */
  const visibleTo = async (p: Principal) =>
    inWorkspace(p.workspaceId, async () => {
      const rows = await prisma.ticket.findMany({
        where: { AND: [scope.visibilityWhere(p) as Prisma.TicketWhereInput, onlyOurs] },
        select: { id: true },
      });
      return new Set(rows.map((r) => r.id));
    });

  const id = (i: number) => f.tickets[i].id;

  describe('humans', () => {
    it('an admin sees every ticket, including unrouted', async () => {
      const seen = await visibleTo(asUser(f.id, f.admin, 'admin', f.teamA));
      expect(seen.size).toBe(6);
      expect(seen.has(id(5))).toBe(true); // unrouted
    });

    it('a lead sees only their own team', async () => {
      const seen = await visibleTo(asUser(f.id, f.leadA, 'lead', f.teamA));
      expect(seen).toEqual(new Set([id(0), id(1), id(2)]));
      expect(seen.has(id(3))).toBe(false); // team B
      expect(seen.has(id(5))).toBe(false); // unrouted
    });

    it('an agent sees their team plus anything assigned to them', async () => {
      const seen = await visibleTo(asUser(f.id, f.agentB, 'agent', f.teamB));
      // team B tickets, plus the team-A ticket assigned to agentB
      expect(seen).toEqual(new Set([id(2), id(3), id(4)]));
    });

    // the regression: `{ teamId: undefined }` is dropped by Prisma and matches all
    it('a team-less lead sees NOTHING, not everything', async () => {
      const seen = await visibleTo(asUser(f.id, f.orphanLead, 'lead', null));
      expect(seen.size).toBe(0);
    });

    it('a team-less agent sees only their own assignments', async () => {
      const seen = await visibleTo(asUser(f.id, f.orphanLead, 'agent', null));
      expect(seen.size).toBe(0);
    });
  });

  describe('machines', () => {
    // the second regression: an api_key principal returned {} unconditionally
    it('a key bound to a team is confined to it', async () => {
      const seen = await visibleTo(asKey(f.id, f.teamA));
      expect(seen).toEqual(new Set([id(0), id(1), id(2)]));
      expect(seen.has(id(3))).toBe(false);
    });

    it('an unbound key is workspace-wide (deliberate grant)', async () => {
      // "Instance-wide" is what this grant used to mean and no longer does: the
      // key's own workspace is now the outer limit, so 6 here is the primary
      // fixture's six tickets and not the twelve that exist under this tag.
      const seen = await visibleTo(asKey(f.id, null));
      expect(seen.size).toBe(6);
    });

    it('assertCanAccess refuses a bound key reaching another team', () => {
      const key = asKey(f.id, f.teamA);
      expect(() => scope.assertCanAccess(key, { teamId: f.teamB, assigneeId: null })).toThrow(ForbiddenException);
      expect(() => scope.assertCanAccess(key, { teamId: f.teamA, assigneeId: null })).not.toThrow();
    });
  });

  /**
   * Two encodings of one rule will drift unless something forces them together.
   * This runs both against the same database and compares row sets.
   */
  describe('the SQL and Prisma encodings agree', () => {
    const principals = () => [
      ['admin', asUser(f.id, f.admin, 'admin', f.teamA)],
      ['lead', asUser(f.id, f.leadA, 'lead', f.teamA)],
      ['agent', asUser(f.id, f.agentB, 'agent', f.teamB)],
      ['orphan lead', asUser(f.id, f.orphanLead, 'lead', null)],
      ['bound key', asKey(f.id, f.teamA)],
      ['unbound key', asKey(f.id, null)],
    ] as const;

    it('returns identical row sets for every principal shape', async () => {
      for (const [label, p] of principals()) {
        const viaPrisma = await visibleTo(p);

        const rows = await inWorkspace(p.workspaceId, () =>
          prisma.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT id FROM tickets
                       WHERE ${scope.visibilitySql(p)} AND subject LIKE ${onlyOurs.subject.startsWith + '%'}`,
          ),
        );
        const viaSql = new Set(rows.map((r) => r.id));

        expect({ label, ids: [...viaSql].sort() }).toEqual({ label, ids: [...viaPrisma].sort() });
      }
    });
  });
});
