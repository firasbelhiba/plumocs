import { Prisma } from '@prisma/client';
import { TeamScopeService } from '../../src/common/guards/team-scope.service';
import { prisma, seedFixture, cleanup, inWorkspace, onlyOurs, asUser, asKey, type Fixture } from './harness';
import type { Principal } from '../../src/common/decorators';

jest.setTimeout(30_000);

describe('SLA sweep marker append (integration)', () => {
  let f: Fixture;
  beforeAll(async () => { f = await seedFixture(); });
  afterAll(cleanup);

  /**
   * Exactly the statement the sweep runs, in exactly the unit of work it runs it
   * in — one bound transaction per append, which is what WorkspaceContextService
   * .forEachWorkspace gives a worker. Sharing one transaction between the eight
   * appends below would serialise them and quietly turn the concurrency test
   * into a sequential one.
   */
  const appendMarker = (ticketId: string, marker: string) =>
    inWorkspace(f.id, () =>
      prisma.$executeRaw(
        Prisma.sql`UPDATE tickets
                   SET tags = array_append(tags, ${marker})
                   WHERE id = ${ticketId}::uuid
                     AND NOT (tags @> ARRAY[${marker}]::text[])`,
      ),
    );

  const ticket = (id: string) => inWorkspace(f.id, () => prisma.ticket.findUniqueOrThrow({ where: { id } }));

  it('appends the marker once and reports rows affected', async () => {
    const id = f.tickets[0].id;
    expect(await appendMarker(id, 'sla:breached')).toBe(1);
    const t = await ticket(id);
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
    const t = await ticket(id);
    expect(t.tags.filter((x) => x === 'sla:breached')).toHaveLength(1);
  });

  it('survives concurrent sweeps without double-appending', async () => {
    const id = f.tickets[2].id;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => appendMarker(id, 'sla:due-soon')),
    );
    const winners = results.filter((r) => r === 1).length;

    expect(winners).toBe(1); // exactly one sweep notifies
    const t = await ticket(id);
    expect(t.tags.filter((x) => x === 'sla:due-soon')).toHaveLength(1);
  });

  it('does not disturb the ticket a marker was not meant for', async () => {
    const other = await ticket(f.tickets[3].id);
    expect(other.tags).not.toContain('sla:breached');
  });

  // A sweep that lost its binding must not reach across the desk it is sweeping.
  it('a marker cannot be appended to another workspace’s ticket', async () => {
    const foreign = f.other.tickets[0].id;
    // Bound to the primary desk, addressing the other desk's ticket by its id —
    // the shape of a worker that enumerated tenants correctly and then used a
    // ticket id from the wrong one. USING filters what an UPDATE can even see,
    // so this matches nothing rather than silently tagging a stranger's ticket.
    expect(await appendMarker(foreign, 'sla:breached')).toBe(0);

    const t = await inWorkspace(f.other.id, () => prisma.ticket.findUniqueOrThrow({ where: { id: foreign } }));
    expect(t.tags).not.toContain('sla:breached');
  });
});

describe('tag facet aggregation (integration)', () => {
  const scope = new TeamScopeService(prisma);
  let f: Fixture;
  beforeAll(async () => { f = await seedFixture(); });
  afterAll(cleanup);

  /** The SQL the counts() endpoint now runs, restricted to our fixtures. */
  async function facetSql(p: Principal) {
    const rows = await inWorkspace(p.workspaceId, () =>
      prisma.$queryRaw<Array<{ tag: string; n: bigint }>>(
        Prisma.sql`SELECT unnest(tags) AS tag, count(*) AS n
                   FROM tickets
                   WHERE ${scope.visibilitySql(p)} AND subject LIKE ${onlyOurs.subject.startsWith + '%'}
                   GROUP BY 1`,
      ),
    );
    return Object.fromEntries(rows.filter((r) => !r.tag.startsWith('sla:')).map((r) => [r.tag, Number(r.n)]));
  }

  /** The old approach: pull every visible ticket's tags and count in Node. */
  async function facetInNode(p: Principal) {
    const rows = await inWorkspace(p.workspaceId, () =>
      prisma.ticket.findMany({
        where: { AND: [scope.visibilityWhere(p) as Prisma.TicketWhereInput, onlyOurs] },
        select: { tags: true },
      }),
    );
    const out: Record<string, number> = {};
    for (const r of rows) for (const t of r.tags) if (!t.startsWith('sla:')) out[t] = (out[t] ?? 0) + 1;
    return out;
  }

  it('matches the previous in-Node counts for every principal shape', async () => {
    const principals = [
      ['admin', asUser(f.id, f.admin, 'admin', f.teamA)],
      ['lead', asUser(f.id, f.leadA, 'lead', f.teamA)],
      ['agent', asUser(f.id, f.agentB, 'agent', f.teamB)],
      ['orphan lead', asUser(f.id, f.orphanLead, 'lead', null)],
      ['bound key', asKey(f.id, f.teamA)],
      ['unbound key', asKey(f.id, null)],
    ] as const;

    for (const [label, p] of principals) {
      expect({ label, facet: await facetSql(p) }).toEqual({ label, facet: await facetInNode(p) });
    }
  });

  it('a lead only counts tags on their own team’s tickets', async () => {
    // fixture: team A has billing x2, bug x1; team B has billing x1, bug x1
    expect(await facetSql(asUser(f.id, f.leadA, 'lead', f.teamA))).toEqual({ billing: 2, bug: 1 });
  });

  it('an admin counts only their own workspace’s tags', async () => {
    // An admin's visibilitySql is the bare `TRUE`: this predicate contributes
    // NOTHING, so the whole of the tenant separation here is the policy. The
    // other workspace holds the same tag distribution under the same tag prefix,
    // and doubled counts are what a dropped binding would look like.
    expect(await facetSql(asUser(f.id, f.admin, 'admin', f.teamA))).toEqual({ billing: 3, bug: 2 });
  });

  it('excludes sweep markers from the user-facing facet', async () => {
    await inWorkspace(f.id, () =>
      prisma.$executeRaw(
        Prisma.sql`UPDATE tickets SET tags = array_append(tags, 'sla:breached')
                   WHERE id = ${f.tickets[0].id}::uuid`,
      ),
    );
    const facet = await facetSql(asUser(f.id, f.admin, 'admin', f.teamA));
    expect(Object.keys(facet).some((k) => k.startsWith('sla:'))).toBe(false);
  });
});
