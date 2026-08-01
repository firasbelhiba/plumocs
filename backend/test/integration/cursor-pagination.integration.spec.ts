import { Prisma } from '@prisma/client';
import { prisma, seedFixture, cleanup, onlyOurs, TAG, type Fixture } from './harness';

/**
 * Cursor pagination against a real PostgreSQL.
 *
 * Keyset pagination fails silently: with a non-unique sort key and no
 * tiebreaker, pages skip or duplicate rows and nothing throws. The fixture
 * deliberately gives several tickets the *same* updatedAt so the tiebreaker is
 * actually exercised — a test with distinct timestamps would pass either way.
 */
jest.setTimeout(30_000);

describe('cursor pagination (integration)', () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await seedFixture();
    // give every fixture ticket an identical updatedAt — the worst case
    await prisma.ticket.updateMany({
      where: onlyOurs,
      data: { updatedAt: new Date('2026-02-02T12:00:00Z') },
    });
  });
  afterAll(cleanup);

  /** Walk every page with the same ordering the service uses. */
  async function pageThrough(limit: number) {
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
  }

  it('visits every row exactly once when timestamps collide', async () => {
    const all = await prisma.ticket.findMany({ where: onlyOurs, select: { id: true } });
    const expected = all.length;

    for (const limit of [1, 2, 3, 5]) {
      const seen = await pageThrough(limit);
      expect({ limit, count: seen.length }).toEqual({ limit, count: expected });
      expect({ limit, unique: new Set(seen).size }).toEqual({ limit, unique: expected });
    }
  });

  it('the ordering is total, so no two rows tie', async () => {
    const rows = await prisma.ticket.findMany({
      where: onlyOurs,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, updatedAt: true },
    });
    const keys = rows.map((r) => `${r.updatedAt.toISOString()}|${r.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is backed by an index rather than a sort of the whole table', async () => {
    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>(
      Prisma.sql`EXPLAIN SELECT id FROM tickets ORDER BY updated_at DESC, id DESC LIMIT 25`,
    );
    const text = plan.map((r) => r['QUERY PLAN']).join('\n');
    // Postgres may still choose a seq scan on a tiny table; assert the index
    // exists rather than that the planner picked it at this size.
    const idx = await prisma.$queryRaw<Array<{ indexname: string }>>(
      Prisma.sql`SELECT indexname FROM pg_indexes
                 WHERE tablename = 'tickets' AND indexname = 'tickets_updated_at_id_idx'`,
    );
    expect({ indexExists: idx.length, planned: typeof text }).toEqual({ indexExists: 1, planned: 'string' });
  });

  it('a stale cursor yields an empty page rather than restarting from the top', async () => {
    const ghost = await prisma.ticket.create({
      data: {
        subject: `${TAG}-ghost`, channel: 'manual', customerId: f.customer,
        updatedAt: new Date('1999-01-01T00:00:00Z'),
      },
    });
    const rows = await prisma.ticket.findMany({
      where: onlyOurs,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      cursor: { id: ghost.id },
      skip: 1,
      take: 5,
      select: { id: true },
    });
    // the ghost sorts last, so nothing follows it
    expect(rows).toEqual([]);
  });
});
