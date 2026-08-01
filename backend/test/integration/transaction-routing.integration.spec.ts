import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Proves that every query issued during a transaction actually lands *in* that
 * transaction, however it was written.
 *
 * This is the load-bearing property for tenant scoping. The workspace will be
 * bound with `set_config('app.workspace_id', …, true)` — transaction-local,
 * because a session-local setting survives on a pooled connection and hands the
 * next request the previous tenant's scope. Transaction-local means a query
 * that quietly takes a different connection from the pool sees no workspace at
 * all, and a nested transaction can block forever on rows the outer one holds.
 *
 * Rollback is the assertion because it is unforgeable: a write that survives a
 * rolled-back transaction was, by definition, not part of it.
 */
describe('transaction routing', () => {
  const prisma = new PrismaService();
  const TAG = `txtest-${process.pid}-${Math.floor(Math.random() * 1e6)}`;

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.$disconnect();
  });

  it('a service-style call inside a transaction joins it instead of taking a pooled connection', async () => {
    const name = `${TAG}-implicit`;

    await expect(
      prisma.$transaction(async () => {
        // Deliberately `prisma.*`, not the `tx` handed to the callback — this
        // is how all 23 services are written and how the 24th will be.
        await prisma.team.create({ data: { name } });
        expect(await prisma.team.findFirst({ where: { name } })).not.toBeNull();
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    expect(await prisma.team.findFirst({ where: { name } })).toBeNull();
  });

  it('raw SQL joins the transaction too', async () => {
    // The tag facet, the reports and the SLA sweep are raw. If $queryRaw and
    // $executeRaw reached the pool directly they would run with no workspace
    // bound and return nothing once policies exist.
    const name = `${TAG}-raw`;
    const team = await prisma.team.create({ data: { name } });

    await expect(
      prisma.$transaction(async () => {
        await prisma.$executeRaw`UPDATE teams SET name = ${`${name}-touched`} WHERE id = ${team.id}::uuid`;
        const rows = await prisma.$queryRaw<{ name: string }[]>`
          SELECT name FROM teams WHERE id = ${team.id}::uuid`;
        expect(rows[0].name).toBe(`${name}-touched`); // the write is visible to the read
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    // Had either statement reached the pool directly, the rename would have
    // committed on its own connection and survived this rollback.
    const after = await prisma.team.findUnique({ where: { id: team.id } });
    expect(after?.name).toBe(name);
  });

  it('a nested $transaction joins the outer one rather than committing on its own', async () => {
    const name = `${TAG}-nested`;

    await expect(
      prisma.$transaction(async () => {
        await prisma.$transaction(async () => {
          await prisma.team.create({ data: { name } });
        });
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    // Prisma cannot nest: without the join the inner transaction would have run
    // on its own connection and committed, leaving this row behind.
    expect(await prisma.team.findFirst({ where: { name } })).toBeNull();
  });

  it('the array form of $transaction also joins rather than deadlocking', async () => {
    const name = `${TAG}-array`;

    await expect(
      prisma.$transaction(async () => {
        const created = await prisma.team.create({ data: { name } });
        // auth, email and tickets all batch writes this way
        await prisma.$transaction([
          prisma.team.update({ where: { id: created.id }, data: { name: `${name}-renamed` } }),
        ]);
        expect(await prisma.team.findFirst({ where: { name: `${name}-renamed` } })).not.toBeNull();
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    expect(await prisma.team.findMany({ where: { name: { startsWith: `${TAG}-array` } } })).toHaveLength(0);
  });

  it('outside a transaction, queries still reach the database normally', async () => {
    const name = `${TAG}-plain`;
    const team = await prisma.team.create({ data: { name } });
    expect(await prisma.team.findUnique({ where: { id: team.id } })).not.toBeNull();
  });
});
