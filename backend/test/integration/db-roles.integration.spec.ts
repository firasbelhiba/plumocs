import { PrismaClient } from '@prisma/client';
import { assertUnprivilegedConnection } from '../../src/prisma/prisma.service';

/**
 * The preconditions row-level security depends on.
 *
 * None of this is enforced by application code, and none of it fails loudly on
 * its own: a `GRANT` handed out in a hurry, an `ALTER ROLE … SUPERUSER` during
 * an incident, or a DATABASE_URL edited back to the owner all leave a system
 * that works perfectly and isolates nothing. These assertions are the only
 * place that difference is visible.
 *
 * Written before the first policy exists, on purpose — a policy added to a
 * database where the runtime is exempt is worse than no policy, because it
 * looks like protection.
 *
 * Since Phase 3 it also asserts the policies themselves are PRESENT, table by
 * table. workspace-isolation.integration.spec.ts proves the boundary holds for
 * the tables its fixture touches; only a catalogue check can say anything about
 * the table somebody adds next week. The migration derives its list from "has a
 * workspace_id column" for that reason, and this is the assertion that the
 * derivation still covers everything.
 */
describe('database role separation', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it('the runtime connection is neither superuser, BYPASSRLS, nor a table owner', async () => {
    const row = await assertUnprivilegedConnection(prisma, 'The runtime');
    expect(row.isSuperuser).toBe(false);
    expect(row.bypassesRls).toBe(false);
    expect(row.ownsTables).toBe(0n);
  });

  it('the runtime cannot create tables, so no table can escape a future policy', async () => {
    await expect(prisma.$executeRawUnsafe('CREATE TABLE rls_escape_hatch (x int)')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('the runtime cannot turn row-level security off', async () => {
    // ALTER TABLE … DISABLE ROW LEVEL SECURITY is owner-only. If the runtime
    // could run it, every policy would be one statement away from irrelevant.
    await expect(
      prisma.$executeRawUnsafe('ALTER TABLE tickets DISABLE ROW LEVEL SECURITY'),
    ).rejects.toThrow(/must be owner/i);
  });

  it('the runtime cannot become the schema owner', async () => {
    await expect(prisma.$executeRawUnsafe('SET ROLE plumo_migrator')).rejects.toThrow(
      /permission denied to set role/i,
    );
  });

  it('every table in public is owned by the migrator, not the runtime', async () => {
    const rows = await prisma.$queryRaw<{ tableowner: string; n: bigint }[]>`
      SELECT tableowner, count(*) AS n
      FROM pg_tables WHERE schemaname = 'public'
      GROUP BY tableowner
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].tableowner).toBe('plumo_migrator');
  });

  it('rejects the migrator connection, which owns the tables', async () => {
    // The case most likely to slip through review: plumo_migrator is not a
    // superuser and holds no BYPASSRLS, so it reads as harmless — yet as the
    // table owner it is exempt from every policy that lacks FORCE ROW LEVEL
    // SECURITY. Pointing DATABASE_URL here would look like a lateral move and
    // would quietly switch tenant isolation off.
    const owner = new PrismaClient({
      datasources: { db: { url: process.env.MIGRATE_DATABASE_URL } },
    });
    try {
      await expect(assertUnprivilegedConnection(owner, 'The runtime')).rejects.toThrow(
        /owns \d+ table/,
      );
    } finally {
      await owner.$disconnect();
    }
  });

  it('every table carrying workspace_id has row-level security ON and a policy', async () => {
    // Two failures, one query. `relrowsecurity` false means the policy is there
    // and inert; a missing policy on an RLS-enabled table means the table is
    // unreadable rather than unprotected. Both are silent until a customer
    // notices, and a new tenant table arriving without either is the likeliest
    // way this regresses — nothing in the application would change.
    const gaps = await prisma.$queryRaw<{ table: string; rlsEnabled: boolean; policies: bigint }[]>`
      SELECT c.relname::text AS "table",
             c.relrowsecurity AS "rlsEnabled",
             (SELECT count(*) FROM pg_policy p
               WHERE p.polrelid = c.oid AND p.polname = 'workspace_isolation') AS "policies"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM information_schema.columns col
                     WHERE col.table_schema = 'public'
                       AND col.table_name = c.relname
                       AND col.column_name = 'workspace_id')
        AND (NOT c.relrowsecurity OR NOT EXISTS (
              SELECT 1 FROM pg_policy p
               WHERE p.polrelid = c.oid AND p.polname = 'workspace_isolation'))
      ORDER BY c.relname
    `;
    expect(gaps).toEqual([]);

    // ...and there are tenant tables at all. Without this the assertion above is
    // satisfied by a database where the tenancy migration never ran.
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pg_policy WHERE polname = 'workspace_isolation'
    `;
    expect(Number(n)).toBeGreaterThanOrEqual(17);
  });

  it('users is deliberately NOT under a workspace policy', async () => {
    // The exclusion is as load-bearing as the inclusions. Login has to find a
    // user by email BEFORE any workspace is known, so a workspace predicate here
    // would not leak anything — it would make logging in impossible, for
    // everybody, at the next deploy. Same for the sessions hanging off a person.
    const covered = await prisma.$queryRaw<{ table: string }[]>`
      SELECT c.relname::text AS "table"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('users', 'refresh_tokens', 'password_resets', 'workspaces')
        AND c.relrowsecurity
    `;
    expect(covered).toEqual([]);
  });

  it('the runtime cannot delete a workspace', async () => {
    // REVOKE DELETE ON workspaces, belt and braces with the ON DELETE RESTRICT
    // on every tenant foreign key: RESTRICT stops the delete while data exists,
    // the revoke stops the statement being issuable at all — including after a
    // purge job has emptied the desk. Asserted here because roles.sql's
    // unconditional `GRANT ... ON ALL TABLES` silently undoes it on its next run,
    // and nothing else would report that.
    const [row] = await prisma.$queryRaw<{ mayDelete: boolean }[]>`
      SELECT has_table_privilege(current_user, 'workspaces', 'DELETE') AS "mayDelete"
    `;
    expect(row.mayDelete).toBe(false);
  });

  it('future tables are readable by the runtime without a manual GRANT', async () => {
    // Default privileges are easy to forget and fail late: without them the next
    // migration ships a table the application gets "permission denied" on, in
    // production, at request time.
    const [row] = await prisma.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_default_acl d
        JOIN pg_namespace n ON n.oid = d.defaclnamespace
        WHERE n.nspname = 'public'
          AND d.defaclobjtype = 'r'
          AND array_to_string(d.defaclacl, ',') LIKE '%plumo_app=arwd%'
      ) AS present
    `;
    expect(row.present).toBe(true);
  });
});
