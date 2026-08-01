import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TeamScopeService } from '../../src/common/guards/team-scope.service';
import { prisma, seedFixture, cleanup, onlyOurs, asUser, asKey, type Fixture } from './harness';

/**
 * Row-level scoping, executed against a real PostgreSQL.
 *
 * The unit suite asserts the *shape* of the where-fragment. That cannot catch a
 * fragment which is well-formed but matches every row — the exact bug that let a
 * team-less lead read the whole instance. These tests assert on rows returned.
 */
jest.setTimeout(30_000);

describe('TeamScopeService (integration)', () => {
  const scope = new TeamScopeService(prisma as never);
  let f: Fixture;

  beforeAll(async () => { f = await seedFixture(); });
  afterAll(cleanup);

  /** Ticket ids visible to a principal, restricted to this run's fixtures. */
  const visibleTo = async (p: Parameters<typeof scope.visibilityWhere>[0]) => {
    const rows = await prisma.ticket.findMany({
      where: { AND: [scope.visibilityWhere(p) as Prisma.TicketWhereInput, onlyOurs] },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  };

  const id = (i: number) => f.tickets[i].id;

  describe('humans', () => {
    it('an admin sees every ticket, including unrouted', async () => {
      const seen = await visibleTo(asUser(f.admin, 'admin', f.teamA));
      expect(seen.size).toBe(6);
      expect(seen.has(id(5))).toBe(true); // unrouted
    });

    it('a lead sees only their own team', async () => {
      const seen = await visibleTo(asUser(f.leadA, 'lead', f.teamA));
      expect(seen).toEqual(new Set([id(0), id(1), id(2)]));
      expect(seen.has(id(3))).toBe(false); // team B
      expect(seen.has(id(5))).toBe(false); // unrouted
    });

    it('an agent sees their team plus anything assigned to them', async () => {
      const seen = await visibleTo(asUser(f.agentB, 'agent', f.teamB));
      // team B tickets, plus the team-A ticket assigned to agentB
      expect(seen).toEqual(new Set([id(2), id(3), id(4)]));
    });

    // the regression: `{ teamId: undefined }` is dropped by Prisma and matches all
    it('a team-less lead sees NOTHING, not everything', async () => {
      const seen = await visibleTo(asUser(f.orphanLead, 'lead', null));
      expect(seen.size).toBe(0);
    });

    it('a team-less agent sees only their own assignments', async () => {
      const seen = await visibleTo(asUser(f.orphanLead, 'agent', null));
      expect(seen.size).toBe(0);
    });
  });

  describe('machines', () => {
    // the second regression: an api_key principal returned {} unconditionally
    it('a key bound to a team is confined to it', async () => {
      const seen = await visibleTo(asKey(f.teamA));
      expect(seen).toEqual(new Set([id(0), id(1), id(2)]));
      expect(seen.has(id(3))).toBe(false);
    });

    it('an unbound key is instance-wide (deliberate grant)', async () => {
      const seen = await visibleTo(asKey(null));
      expect(seen.size).toBe(6);
    });

    it('assertCanAccess refuses a bound key reaching another team', () => {
      const key = asKey(f.teamA);
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
      ['admin', asUser(f.admin, 'admin', f.teamA)],
      ['lead', asUser(f.leadA, 'lead', f.teamA)],
      ['agent', asUser(f.agentB, 'agent', f.teamB)],
      ['orphan lead', asUser(f.orphanLead, 'lead', null)],
      ['bound key', asKey(f.teamA)],
      ['unbound key', asKey(null)],
    ] as const;

    it('returns identical row sets for every principal shape', async () => {
      for (const [label, p] of principals()) {
        const viaPrisma = await visibleTo(p);

        const rows = await prisma.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM tickets
                     WHERE ${scope.visibilitySql(p)} AND subject LIKE ${onlyOurs.subject.startsWith + '%'}`,
        );
        const viaSql = new Set(rows.map((r) => r.id));

        expect({ label, ids: [...viaSql].sort() }).toEqual({ label, ids: [...viaPrisma].sort() });
      }
    });
  });
});
