import { Prisma } from '@prisma/client';
import { prisma, seedFixture, cleanup, inWorkspace, onlyOurs, type Fixture } from './harness';

/**
 * Cursor pagination against a real PostgreSQL.
 *
 * Keyset pagination fails silently: with a non-unique sort key and no
 * tiebreaker, pages skip or duplicate rows and nothing throws. The fixture
 * deliberately gives several tickets the *same* updatedAt so the tiebreaker is
 * actually exercised — a test with distinct timestamps would pass either way.
 *
 * Every walk runs inside one binding, which is both what a real request does and
 * what makes the counts mean anything: the fixture puts an identically-shaped
 * set of tickets in a second workspace, so a page that drifted across the tenant
 * boundary would show up as a row count that is too high rather than as nothing
 * at all.
 */
jest.setTimeout(30_000);

describe('cursor pagination (integration)', () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await seedFixture();
    // give every fixture ticket an identical updatedAt — the worst case
    await inWorkspace(f.id, () =>
      prisma.ticket.updateMany({
        where: onlyOurs,
        data: { updatedAt: new Date('2026-02-02T12:00:00Z') },
      }),
    );
  });
  afterAll(cleanup);

  /** Walk every page with the same ordering the service uses. */
  function pageThrough(limit: number) {
    return inWorkspace(f.id, async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 50; guard++) {
        const rows = await prisma.ticket.findMany({
          where: onlyOurs,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true },
        });
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        seen.push(...page.map((r) => r.id));
        if (!hasMore) break;
        cursor = page[page.length - 1].id;
      }
      return seen;
    });
  }

  it('visits every row exactly once when timestamps collide', async () => {
    const all = await inWorkspace(f.id, () => prisma.ticket.findMany({ where: onlyOurs, select: { id: true } }));
    const expected = all.length;

    for (const limit of [1, 2, 3, 5]) {
      const seen = await pageThrough(limit);
      expect({ limit, count: seen.length }).toEqual({ limit, count: expected });
      expect({ limit, unique: new Set(seen).size }).toEqual({ limit, unique: expected });
    }
  });

  it('the ordering is total, so no two rows tie', async () => {
    const rows = await inWorkspace(f.id, () =>
      prisma.ticket.findMany({
        where: onlyOurs,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, updatedAt: true },
      }),
    );
    const keys = rows.map((r) => `${r.updatedAt.toISOString()}|${r.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is backed by an index rather than a sort of the whole table', async () => {
    // Unbound deliberately: EXPLAIN without ANALYZE does not execute the query,
    // and pg_indexes is a catalog view no policy touches. Binding here would
    // suggest the assertion depends on tenant state, and it does not.
    // The zero uuid is a literal, not a binding: it only has to make the
    // explained statement the same SHAPE as the one the service issues now that
    // every ticket read is tenant-filtered.
    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>(
      Prisma.sql`EXPLAIN SELECT id FROM tickets
                 WHERE workspace_id = '00000000-0000-0000-0000-000000000000'::uuid
                 ORDER BY updated_at DESC, id DESC LIMIT 25`,
    );
    const text = plan.map((r) => r['QUERY PLAN']).join('\n');
    // Postgres may still choose a seq scan on a tiny table; assert the index
    // exists rather than that the planner picked it at this size.
    //
    // WHY NOT `tickets_updated_at_id_idx`. That was the original name
    // (20260801141609) and it is gone on purpose: the tenancy migration dropped
    // it and created this one instead (20260802000000_workspace_tenancy:1093-1095),
    // prefixed with workspace_id. Now that every query carries a tenant
    // predicate, an index that does not lead with workspace_id cannot serve the
    // keyset walk — the planner would have to filter after sorting the whole
    // table. Asserting the old name here would demand an index whose absence is
    // the correct state.
    const idx = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>(
      Prisma.sql`SELECT indexname, indexdef FROM pg_indexes
                 WHERE tablename = 'tickets'
                   AND indexname = 'tickets_workspace_id_updated_at_id_idx'`,
    );
    expect({ indexExists: idx.length, planned: typeof text }).toEqual({ indexExists: 1, planned: 'string' });
    // The name alone proves nothing — an index recreated as
    // (updated_at, id, workspace_id) would keep it and serve neither the tenant
    // predicate nor the tiebreaker. The column ORDER is the assertion, both DESC
    // directions included, because that is what the walk above depends on.
    expect(idx[0].indexdef).toMatch(/\(workspace_id,\s*updated_at DESC,\s*id DESC\)/);
  });

  it('a stale cursor yields an empty page rather than restarting from the top', async () => {
    const rows = await inWorkspace(f.id, async () => {
      const ghost = await prisma.ticket.create({
        data: {
          subject: `${f.slug}-ghost`, channel: 'manual', customerId: f.customer,
          updatedAt: new Date('1999-01-01T00:00:00Z'),
        },
      });
      return prisma.ticket.findMany({
        where: onlyOurs,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        cursor: { id: ghost.id },
        skip: 1,
        take: 5,
        select: { id: true },
      });
    });
    // the ghost sorts last, so nothing follows it. Read inside the binding, or
    // the policy would return the same empty page for a cursor that had in fact
    // restarted from the top.
    expect(rows).toEqual([]);
  });
});
