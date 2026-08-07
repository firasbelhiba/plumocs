import { prisma, workspaces, createWorkspace, inWorkspace, cleanup, TAG } from './harness';

/**
 * Proves that every query issued during a transaction actually lands *in* that
 * transaction, however it was written.
 *
 * This is the load-bearing property for tenant scoping. The workspace is bound
 * with `set_config('app.workspace_id', …, true)` — transaction-local, because a
 * session-local setting survives on a pooled connection and hands the next
 * request the previous tenant's scope. Transaction-local means a query that
 * quietly takes a different connection from the pool sees no workspace at all,
 * and a nested transaction can block forever on rows the outer one holds.
 *
 * Rollback is the assertion because it is unforgeable: a write that survives a
 * rolled-back transaction was, by definition, not part of it.
 *
 * EVERY "the row is gone" CHECK RUNS BOUND. Under row-level security an unbound
 * read returns nothing whatever the truth is, so verifying a rollback on an
 * unbound connection would pass for a leaked write just as happily as for a
 * clean one — the assertion would survive the exact bug it exists to catch.
 */
describe('transaction routing', () => {
  let ws: string;

  beforeAll(async () => { ws = (await createWorkspace('txroute')).id; });
  afterAll(cleanup);

  /** What the request interceptor does on entry, minus the interceptor. */
  const bind = () => workspaces.bind(ws);

  /** The bound read used to check what actually survived a rollback. */
  const teamNamed = (name: string) => inWorkspace(ws, () => prisma.team.findFirst({ where: { name } }));

  it('a service-style call inside a transaction joins it instead of taking a pooled connection', async () => {
    const name = `${TAG}-implicit`;

    await expect(
      prisma.$transaction(async () => {
        await bind();
        // Deliberately `prisma.*`, not the `tx` handed to the callback — this
        // is how all 23 services are written and how the 24th will be.
        await prisma.team.create({ data: { name } });
        expect(await prisma.team.findFirst({ where: { name } })).not.toBeNull();
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    expect(await teamNamed(name)).toBeNull();
  });

  it('raw SQL joins the transaction too', async () => {
    // The tag facet, the reports and the SLA sweep are raw. If $queryRaw and
    // $executeRaw reached the pool directly they would run with no workspace
    // bound and return nothing now that policies exist.
    const name = `${TAG}-raw`;
    const team = await inWorkspace(ws, () => prisma.team.create({ data: { name } }));

    await expect(
      prisma.$transaction(async () => {
        await bind();
        await prisma.$executeRaw`UPDATE teams SET name = ${`${name}-touched`} WHERE id = ${team.id}::uuid`;
        const rows = await prisma.$queryRaw<{ name: string }[]>`
          SELECT name FROM teams WHERE id = ${team.id}::uuid`;
        expect(rows[0].name).toBe(`${name}-touched`); // the write is visible to the read
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    // Had either statement reached the pool directly, the rename would have
    // committed on its own connection and survived this rollback.
    const after = await inWorkspace(ws, () => prisma.team.findUnique({ where: { id: team.id } }));
    expect(after?.name).toBe(name);
  });

  it('a nested $transaction joins the outer one rather than committing on its own', async () => {
    const name = `${TAG}-nested`;

    await expect(
      prisma.$transaction(async () => {
        await bind();
        await prisma.$transaction(async () => {
          await prisma.team.create({ data: { name } });
        });
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    // Prisma cannot nest: without the join the inner transaction would have run
    // on its own connection and committed, leaving this row behind. Since
    // tenancy it would not even get that far — a second connection carries none
    // of this one's SET LOCAL state, so workspace_id would default to NULL and
    // the insert would fail on the not-null instead. Either way the join is what
    // makes the write both atomic and attributable.
    expect(await teamNamed(name)).toBeNull();
  });

  it('the array form of $transaction also joins rather than deadlocking', async () => {
    const name = `${TAG}-array`;

    await expect(
      prisma.$transaction(async () => {
        await bind();
        const created = await prisma.team.create({ data: { name } });
        // auth, email and tickets all batch writes this way
        await prisma.$transaction([
          prisma.team.update({ where: { id: created.id }, data: { name: `${name}-renamed` } }),
        ]);
        expect(await prisma.team.findFirst({ where: { name: `${name}-renamed` } })).not.toBeNull();
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    const survivors = await inWorkspace(ws, () =>
      prisma.team.findMany({ where: { name: { startsWith: `${TAG}-array` } } }),
    );
    expect(survivors).toHaveLength(0);
  });

  it('the binding survives the function call that set it', async () => {
    // The subtlest failure in the tenancy migration, and the one it warns about
    // by name: a plpgsql function carrying a `SET` clause runs in a new GUC nest
    // level, and on return fmgr pops every entry at or above it — discarding a
    // transaction-local setting the instant app_set_workspace() returned.
    // Nothing would error; every request would simply run unbound. Reading the
    // GUC back through the same statement path the policies use is what makes a
    // future "hardening" of that function fail here instead of in production.
    const bound = await prisma.$transaction(async () => {
      await bind();
      const [row] = await prisma.$queryRaw<Array<{ bound: string | null }>>`
        SELECT app_current_workspace()::text AS bound
      `;
      return row.bound;
    });
    expect(bound).toBe(ws);
  });

  it('outside a transaction, queries still reach the database normally', async () => {
    // `users` on purpose: it carries no workspace_id and no policy, so it is the
    // only thing that CAN be written with nothing bound. The property under test
    // is the proxy's pass-through when the AsyncLocalStorage store is empty, not
    // tenancy — using a tenant table here would test the schema instead.
    const name = `${TAG}-plain`;
    const user = await prisma.user.create({
      data: { name, email: `${name}@itest.invalid`, passwordHash: 'x' },
    });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('a tenant write outside a transaction fails closed rather than landing nowhere', async () => {
    // The other half of the bargain the tenancy migration struck: workspace_id
    // defaults to app_current_workspace(), which is NULL when nothing is bound,
    // so a forgotten binding refuses the write instead of filing it under an
    // arbitrary desk. Asserted here because this is the file that owns the
    // question "what happens off the transaction".
    await expect(prisma.team.create({ data: { name: `${TAG}-unbound` } })).rejects.toThrow(
      /null constraint|workspace/i,
    );
  });
});
