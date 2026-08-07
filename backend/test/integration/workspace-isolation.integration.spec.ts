import { Prisma } from '@prisma/client';
import { TeamScopeService } from '../../src/common/guards/team-scope.service';
import {
  prisma, workspaces, seedFixture, cleanup, inWorkspace, onlyOurs, asUser, asKey,
  type Fixture, type WorkspaceFixture,
} from './harness';

/**
 * Tenant isolation, proven rather than assumed.
 *
 * Everything else in this directory asks whether the application filters
 * correctly. This file asks the opposite question: what happens when it does
 * NOT. Phase 3 exists because a handler that forgets its workspace predicate
 * returns every desk's rows and nothing complains, so the assertions below are
 * deliberately written with the application's own filter set to its widest — an
 * admin, whose `visibilityWhere` is `{}` and whose `visibilitySql` is the bare
 * word TRUE. If a single row of the other workspace comes back, the only thing
 * that was ever protecting tenants was code review.
 *
 * WHY TWO WORKSPACES ARE NON-NEGOTIABLE. On a single-tenant instance every one
 * of these tests passes with no policy installed at all: there is nothing to
 * leak. The fixture therefore builds a SECOND desk of the same shape whose rows
 * carry the same run tag, so `onlyOurs` matches both and a leak surfaces as a
 * doubled count rather than as something a reader has to imagine.
 *
 * WHY THE CONNECTION MATTERS MORE THAN THE ASSERTIONS. Postgres exempts a
 * superuser from every policy, and a table owner from every policy that is not
 * FORCEd — silently. Run as either, this whole file is green against a database
 * with no policies whatsoever. global-setup.ts refuses to start the suite on
 * such a connection, and that refusal is what gives these tests their meaning.
 */
jest.setTimeout(30_000);

describe('workspace isolation (row-level security)', () => {
  const scope = new TeamScopeService(prisma);
  let f: Fixture;

  beforeAll(async () => {
    f = await seedFixture();
    // One machine credential per desk. api_keys is the table where a leak is
    // worst — it is a credential's team scope — and without a row in each desk
    // the confinement check below would be satisfied by an empty table.
    const issueKey = (w: WorkspaceFixture) =>
      inWorkspace(w.id, () =>
        prisma.apiKey.create({
          data: {
            name: `${w.slug}-bot`, keyHash: `${w.slug}-hash`, keyPrefix: w.slug.slice(0, 8),
            scopes: ['tickets:read'], teamId: w.teamA, createdById: w.admin,
          },
        }),
      );
    await issueKey(f);
    await issueKey(f.other);
  });
  afterAll(cleanup);

  const subjectsIn = (workspaceId: string) =>
    inWorkspace(workspaceId, async () => {
      const rows = await prisma.ticket.findMany({ where: onlyOurs, select: { subject: true } });
      return rows.map((r) => r.subject).sort();
    });

  describe('reads', () => {
    it('an admin — the widest principal there is — still sees only their own desk', async () => {
      const p = asUser(f.id, f.admin, 'admin', f.teamA);
      expect(scope.visibilityWhere(p)).toEqual({}); // contributes no filter at all
      const seen = await inWorkspace(f.id, () =>
        prisma.ticket.findMany({
          where: { AND: [scope.visibilityWhere(p) as Prisma.TicketWhereInput, onlyOurs] },
          select: { id: true },
        }),
      );
      const foreign = new Set(f.other.tickets.map((t) => t.id));
      expect(seen).toHaveLength(6);
      expect(seen.filter((t) => foreign.has(t.id))).toEqual([]);
    });

    it('the raw-SQL half of the access rule is confined too', async () => {
      // The reports, the tag facet and the SLA sweep are hand-written SQL, which
      // is where a forgotten tenant predicate is easiest to ship: an unbound key
      // compiles to `TRUE` and there is nothing left to review.
      const p = asKey(f.id, null);
      const rows = await inWorkspace(f.id, () =>
        prisma.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM tickets WHERE ${scope.visibilitySql(p)}`,
        ),
      );
      const foreign = new Set(f.other.tickets.map((t) => t.id));
      expect(rows.filter((r) => foreign.has(r.id))).toEqual([]);
    });

    it('the two desks return disjoint, non-empty sets under one identical query', async () => {
      const here = await subjectsIn(f.id);
      const there = await subjectsIn(f.other.id);
      expect(here).toHaveLength(6);
      expect(there).toHaveLength(6);
      expect(here.filter((s) => there.includes(s))).toEqual([]);
    });

    it('another desk’s ticket, addressed by id, is absent rather than forbidden', async () => {
      // Nothing in the application decides this, and absent is the right answer:
      // the service turns a null into 404, whereas a distinguishable "forbidden"
      // would confirm to the caller that the id exists somewhere on the instance.
      const foreign = f.other.tickets[0].id;
      const found = await inWorkspace(f.id, () => prisma.ticket.findUnique({ where: { id: foreign } }));
      expect(found).toBeNull();
    });

    it('teams, customers, memberships and api keys are all confined, not just tickets', async () => {
      // The policy is applied by the migration to every table carrying
      // workspace_id, derived at run time rather than listed. This is the check
      // that the derivation actually reached the tables authority hangs off: a
      // leaked workspace_memberships row is worse than a leaked ticket, because
      // it is a role on somebody else's desk, and RLS filters rows rather than
      // authority.
      const tallyOfOther = async () => ({
        teams: await prisma.team.count({ where: { name: { startsWith: f.other.slug } } }),
        customers: await prisma.customer.count({ where: { name: { startsWith: f.other.slug } } }),
        memberships: await prisma.workspaceMembership.count({ where: { workspaceId: f.other.id } }),
        apiKeys: await prisma.apiKey.count({ where: { name: { startsWith: f.other.slug } } }),
      });

      expect(await inWorkspace(f.id, tallyOfOther)).toEqual({
        teams: 0, customers: 0, memberships: 0, apiKeys: 0,
      });
      // The same query, bound to the desk that owns the rows. Without this half
      // every zero above would be satisfied just as well by a fixture that had
      // created nothing.
      expect(await inWorkspace(f.other.id, tallyOfOther)).toEqual({
        teams: 2, customers: 1, memberships: 5, apiKeys: 1,
      });
    });

    it('an unbound connection sees nothing at all, rather than everything', async () => {
      // The fail-closed direction, and the reason app_current_workspace() may
      // never be given a fallback: `workspace_id = NULL` is NULL, not true. A
      // forgotten binding produces an empty screen, never a cross-tenant leak.
      const rows = await prisma.ticket.findMany({ where: onlyOurs, select: { id: true } });
      expect(rows).toEqual([]);
    });
  });

  describe('writes', () => {
    it('a row cannot be created into another workspace', async () => {
      // WITH CHECK, not USING. Without it a caller bound to one desk could
      // simply name another in the insert and the policy would never look.
      await expect(
        inWorkspace(f.id, () =>
          prisma.team.create({ data: { workspaceId: f.other.id, name: `${f.slug}-smuggled` } }),
        ),
      ).rejects.toThrow(/row-level security|violates/i);
    });

    it('a visible row cannot be updated INTO another workspace', async () => {
      // Two independent locks, and the trigger is the one that fires first: the
      // tenancy migration made workspace_id immutable because every tenant→tenant
      // foreign key is ON UPDATE CASCADE, so a single re-parenting UPDATE would
      // drag a whole conversation — messages, chat sessions, notifications —
      // into another desk consistently enough that no constraint would object.
      await expect(
        inWorkspace(f.id, () =>
          prisma.$executeRaw(
            Prisma.sql`UPDATE tickets SET workspace_id = ${f.other.id}::uuid
                       WHERE id = ${f.tickets[0].id}::uuid`,
          ),
        ),
      ).rejects.toThrow(/immutable|row-level security/i);
    });

    it('an update aimed at another desk’s row changes nothing and says so', async () => {
      const foreign = f.other.tickets[0].id;
      const affected = await inWorkspace(f.id, () =>
        prisma.$executeRaw(
          Prisma.sql`UPDATE tickets SET priority = 'urgent' WHERE id = ${foreign}::uuid`,
        ),
      );
      expect(affected).toBe(0);

      const after = await inWorkspace(f.other.id, () =>
        prisma.ticket.findUniqueOrThrow({ where: { id: foreign }, select: { priority: true } }));
      expect(after.priority).toBe('normal');
    });

    it('a delete aimed at another desk’s row deletes nothing', async () => {
      const foreign = f.other.tickets[1].id;
      const { count } = await inWorkspace(f.id, () => prisma.ticket.deleteMany({ where: { id: foreign } }));
      expect(count).toBe(0);

      const survives = await inWorkspace(f.other.id, () =>
        prisma.ticket.findUnique({ where: { id: foreign }, select: { id: true } }));
      expect(survives).not.toBeNull();
    });

    it('a tenant write with nothing bound is refused outright', async () => {
      // Not merely unscoped — unwritable. workspace_id defaults to
      // app_current_workspace(), so the row is rejected rather than filed under
      // an arbitrary desk. This is the half of the design that makes a forgotten
      // binding loud on writes and silent-but-empty on reads.
      await expect(prisma.team.create({ data: { name: `${f.slug}-nowhere` } })).rejects.toThrow(
        /null constraint|workspace/i,
      );
    });
  });

  describe('per-workspace numbering', () => {
    it('each desk numbers its own tickets from one', async () => {
      // Twelve tickets exist under this tag. A surviving GLOBAL sequence would
      // hand the second desk 7..12 — still unique, still monotonic, and wrong:
      // it leaks one tenant's ticket volume to another and reads as broken to
      // the customer. Both desks answering 1..6 is the only shape that proves
      // the sequence tickets_assign_number() draws from is per-workspace.
      const numbersIn = async (workspaceId: string) => {
        const rows = await inWorkspace(workspaceId, () =>
          prisma.ticket.findMany({ where: onlyOurs, orderBy: { number: 'asc' }, select: { number: true } }));
        return rows.map((r) => Number(r.number));
      };

      expect(await numbersIn(f.id)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(await numbersIn(f.other.id)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('the enumeration the worker depends on', () => {
    it('lists both desks, and a worker body bound per desk sees only that desk', async () => {
      // forEachWorkspace is the only supported way for an unattended job to find
      // tenants. A processor that queried unscoped instead would not fail — it
      // would silently mix desks, which for the nightly export means the first
      // workspace's watermark skips every other.
      const ids = await workspaces.activeWorkspaceIds();
      expect(ids).toEqual(expect.arrayContaining([f.id, f.other.id]));

      const perDesk = new Map<string, number>();
      await workspaces.forEachWorkspace(async (workspaceId) => {
        if (workspaceId !== f.id && workspaceId !== f.other.id) return; // other desks on this database
        perDesk.set(workspaceId, await prisma.ticket.count({ where: onlyOurs }));
      });

      expect(perDesk.get(f.id)).toBe(6);
      expect(perDesk.get(f.other.id)).toBe(6);
    });
  });
});
