import { Prisma } from '@prisma/client';
import { TeamScopeService } from '../../src/common/guards/team-scope.service';
import { prisma, seedFixture, cleanup, onlyOurs, asUser, asKey, type Fixture } from './harness';

jest.setTimeout(30_000);

describe('SLA sweep marker append (integration)', () => {
  let f: Fixture;
  beforeAll(async () => { f = await seedFixture(); });
  afterAll(cleanup);

  /** Exactly the statement the sweep runs. */
  const appendMarker = (ticketId: string, marker: string) =>
    prisma.$executeRaw(
      Prisma.sql`UPDATE tickets
                 SET tags = array_append(tags, ${marker})
                 WHERE id = ${ticketId}::uuid
                   AND NOT (tags @> ARRAY[${marker}]::text[])`,
    );

  it('appends the marker once and reports rows affected', async () => {
    const id = f.tickets[0].id;
    expect(await appendMarker(id, 'sla:breached')).toBe(1);
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(t.tags.filter((x) => x === 'sla:breached')).toHaveLength(1);
  });

  // the regression: the old statement had no guard, so an in-memory
  // `tags.includes()` check taken from a stale snapshot let two overlapping
  // sweeps both append — and both send notifications
  it('is idempotent — a second append is a no-op', async () => {
    const id = f.tickets[1].id;
    await appendMarker(id, 'sla:breached');
    const second = await appendMarker(id, 'sla:breached');

    expect(second).toBe(0); // 0 rows → caller skips notifying
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(t.tags.filter((x) => x === 'sla:breached')).toHaveLength(1);
  });

  it('survives concurrent sweeps without double-appending', async () => {
    const id = f.tickets[2].id;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => appendMarker(id, 'sla:due-soon')),
    );
    const winners = results.filter((r) => r === 1).length;

    expect(winners).toBe(1); // exactly one sweep notifies
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(t.tags.filter((x) => x === 'sla:due-soon')).toHaveLength(1);
  });

  it('does not disturb the ticket a marker was not meant for', async () => {
    const other = await prisma.ticket.findUniqueOrThrow({ where: { id: f.tickets[3].id } });
    expect(other.tags).not.toContain('sla:breached');
  });
});

describe('tag facet aggregation (integration)', () => {
  const scope = new TeamScopeService(prisma as never);
  let f: Fixture;
  beforeAll(async () => { f = await seedFixture(); });
  afterAll(cleanup);

  /** The SQL the counts() endpoint now runs, restricted to our fixtures. */
  async function facetSql(p: Parameters<typeof scope.visibilitySql>[0]) {
    const rows = await prisma.$queryRaw<Array<{ tag: string; n: bigint }>>(
      Prisma.sql`SELECT unnest(tags) AS tag, count(*) AS n
                 FROM tickets
                 WHERE ${scope.visibilitySql(p)} AND subject LIKE ${onlyOurs.subject.startsWith + '%'}
                 GROUP BY 1`,
    );
    return Object.fromEntries(rows.filter((r) => !r.tag.startsWith('sla:')).map((r) => [r.tag, Number(r.n)]));
  }

  /** The old approach: pull every visible ticket's tags and count in Node. */
  async function facetInNode(p: Parameters<typeof scope.visibilityWhere>[0]) {
    const rows = await prisma.ticket.findMany({
      where: { AND: [scope.visibilityWhere(p) as Prisma.TicketWhereInput, onlyOurs] },
      select: { tags: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) for (const t of r.tags) if (!t.startsWith('sla:')) out[t] = (out[t] ?? 0) + 1;
    return out;
  }

  it('matches the previous in-Node counts for every principal shape', async () => {
    const principals = [
      ['admin', asUser(f.admin, 'admin', f.teamA)],
      ['lead', asUser(f.leadA, 'lead', f.teamA)],
      ['agent', asUser(f.agentB, 'agent', f.teamB)],
      ['orphan lead', asUser(f.orphanLead, 'lead', null)],
      ['bound key', asKey(f.teamA)],
      ['unbound key', asKey(null)],
    ] as const;

    for (const [label, p] of principals) {
      expect({ label, facet: await facetSql(p) }).toEqual({ label, facet: await facetInNode(p) });
    }
  });

  it('a lead only counts tags on their own team’s tickets', async () => {
    // fixture: team A has billing x2, bug x1; team B has billing x1, bug x1
    expect(await facetSql(asUser(f.leadA, 'lead', f.teamA))).toEqual({ billing: 2, bug: 1 });
  });

  it('excludes sweep markers from the user-facing facet', async () => {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE tickets SET tags = array_append(tags, 'sla:breached')
                 WHERE id = ${f.tickets[0].id}::uuid`,
    );
    const facet = await facetSql(asUser(f.admin, 'admin', f.teamA));
    expect(Object.keys(facet).some((k) => k.startsWith('sla:'))).toBe(false);
  });
});
