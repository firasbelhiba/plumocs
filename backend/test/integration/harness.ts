import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WorkspaceContextService } from '../../src/common/workspace/workspace-context.service';
import type { Principal } from '../../src/common/decorators';
import type { Role } from '../../src/common/permissions';

/**
 * Integration-test harness — talks to a real PostgreSQL.
 *
 * The unit suite mocks Prisma, which means it cannot catch the failures that
 * actually matter here: a `where` fragment that silently matches every row, an
 * unstable sort that makes cursor pages skip, or the SQL and Prisma encodings of
 * the access rule drifting apart. Those only show up against the real engine.
 *
 * Every fixture is namespaced with a per-run tag so a failed run can never
 * poison the dev database, and `cleanup()` removes exactly what it created.
 *
 * SINCE TENANCY, EVERY QUERY MUST BE BOUND. Row-level security filters every
 * tenant table on `workspace_id = app_current_workspace()`, which reads a
 * transaction-local GUC. An unbound connection therefore sees zero rows and can
 * write none. That is the correct production behaviour and it is a trap for a
 * test suite: an unbound `expect(...).toHaveLength(0)` passes for the wrong
 * reason, and an unbound cleanup deletes nothing while reporting success. So
 * nothing here talks to a tenant table outside `inWorkspace`.
 */

/**
 * PrismaService, not a bare PrismaClient, and that is load-bearing rather than
 * tidiness. The binding is transaction-local, so every statement of a bound unit
 * of work has to run on that one transaction's connection — which is exactly
 * what PrismaService's AsyncLocalStorage proxy arranges and a plain client does
 * not. With a bare client each `prisma.*` call would take a fresh pooled
 * connection with no workspace bound, and the whole suite would quietly assert
 * against an empty database.
 */
export const prisma = new PrismaService();

/**
 * The real service the request interceptor and the worker use, not a
 * test-local reimplementation of it. If `bind` or `runInWorkspace` regresses,
 * this suite is where it should surface — a harness with its own private
 * `set_config` would keep passing while production stopped binding.
 */
export const workspaces = new WorkspaceContextService(prisma, new ConfigService());

/** Open a transaction, bind the tenant, run the body — one HTTP request's shape. */
export const inWorkspace = <T>(workspaceId: string, fn: () => Promise<T>): Promise<T> =>
  workspaces.runInWorkspace(workspaceId, fn);

/** Unique per run so parallel/aborted runs never collide. */
export const TAG = `itest-${process.pid}-${Math.floor(Math.random() * 1e6)}`;

/** Workspaces created by this module, in creation order. Drained by cleanup(). */
const createdWorkspaces: string[] = [];
let workspaceSeq = 0;

/** A tenant and nothing else — for specs that need a binding, not a dataset. */
export interface Tenant {
  id: string;
  slug: string;
}

/** One workspace's worth of fixtures. Ids are workspace-local: nothing is shared. */
export interface WorkspaceFixture extends Tenant {
  teamA: string;
  teamB: string;
  leadA: string;
  agentA: string;
  agentB: string;
  admin: string;
  orphanLead: string;
  customer: string;
  /** ticket id → which team it belongs to */
  tickets: { id: string; team: 'A' | 'B' | null; assignee: string | null }[];
}

/**
 * The primary workspace, flattened, plus a second one built identically.
 *
 * TWO TENANTS, ALWAYS. Isolation is the property most worth testing and it
 * cannot be tested with one workspace: a query bound to the only desk on the
 * instance returns the right rows whether the policy filters anything or not.
 * The second desk holds a structurally identical set of rows — two teams, five
 * seats, six tickets with the same team/assignee/tag spread — and its subjects
 * carry the same run tag, so `onlyOurs` matches both. A leak therefore shows up
 * as a doubled count rather than as an exotic case someone has to think of.
 */
export interface Fixture extends WorkspaceFixture {
  other: WorkspaceFixture;
}

/**
 * A bare tenant.
 *
 * `workspaces` is the one table Phase 3 deliberately left without a policy — the
 * migration derives its list from "has a workspace_id column" and this table is
 * keyed on `id` — so this insert needs no binding. Its AFTER INSERT trigger
 * creates the desk's own ticket-number sequence, which is why a workspace has to
 * exist as a row before anything can create a ticket in it.
 */
export async function createWorkspace(label: string): Promise<Tenant> {
  const slug = `${TAG}-${++workspaceSeq}-${label}`;
  const ws = await prisma.workspace.create({ data: { slug, name: `${TAG} ${label}` } });
  createdWorkspaces.push(ws.id);
  return { id: ws.id, slug };
}

async function seedWorkspace(label: string): Promise<WorkspaceFixture> {
  const ws = await createWorkspace(label);

  return inWorkspace(ws.id, async () => {
    // The same four policies auth.service.ts hands a real desk at creation. A
    // brand-new workspace has none — the backfill migration only reached the
    // desks that existed when it ran — and a priority with no active policy
    // yields a null due date, so every SLA assertion downstream would pass by
    // measuring nothing.
    await prisma.slaPolicy.createMany({
      data: [
        { name: 'Standard', priority: 'low', firstResponseMins: 240, resolutionMins: 1440 },
        { name: 'Standard', priority: 'normal', firstResponseMins: 240, resolutionMins: 1440 },
        { name: 'Priority', priority: 'high', firstResponseMins: 60, resolutionMins: 480 },
        { name: 'Urgent', priority: 'urgent', firstResponseMins: 15, resolutionMins: 240 },
      ],
    });

    const teamA = (await prisma.team.create({ data: { name: `${ws.slug}-teamA` } })).id;
    const teamB = (await prisma.team.create({ data: { name: `${ws.slug}-teamB` } })).id;

    // A person is global and a seat is tenant-owned: `users` carries no
    // workspace_id and no policy, while role and team moved to
    // workspace_memberships. Both halves are needed before a ticket can name an
    // assignee — tickets.assignee_id references (workspace_id, user_id) on
    // memberships, so an unseated user is not merely unauthorised, it is
    // unreferenceable.
    const seat = async (name: string, role: Role, teamId: string | null) => {
      const user = await prisma.user.create({
        data: { name: `${ws.slug}-${name}`, email: `${ws.slug}-${name}@itest.invalid`, passwordHash: 'x' },
      });
      await prisma.workspaceMembership.create({
        data: { workspaceId: ws.id, userId: user.id, role, teamId },
      });
      return user.id;
    };

    const leadA = await seat('leadA', 'lead', teamA);
    const agentA = await seat('agentA', 'agent', teamA);
    const agentB = await seat('agentB', 'agent', teamB);
    const admin = await seat('admin', 'admin', teamA);
    const orphanLead = await seat('orphanLead', 'lead', null);

    const customer = (
      await prisma.customer.create({ data: { name: `${ws.slug}-cust`, email: `${ws.slug}-cust@itest.invalid` } })
    ).id;

    const spec: Array<{ team: 'A' | 'B' | null; assignee: string | null; tags: string[] }> = [
      { team: 'A', assignee: agentA, tags: ['billing', 'bug'] },
      { team: 'A', assignee: null, tags: ['billing'] },
      { team: 'A', assignee: agentB, tags: [] },          // cross-team assignment
      { team: 'B', assignee: agentB, tags: ['billing'] },
      { team: 'B', assignee: null, tags: ['bug'] },
      { team: null, assignee: null, tags: [] },            // unrouted
    ];

    const tickets: WorkspaceFixture['tickets'] = [];
    for (const [i, s] of spec.entries()) {
      const t = await prisma.ticket.create({
        data: {
          subject: `${ws.slug}-ticket-${i}`,
          channel: 'manual',
          customerId: customer,
          teamId: s.team === 'A' ? teamA : s.team === 'B' ? teamB : null,
          assigneeId: s.assignee,
          tags: s.tags,
          // identical timestamps on purpose: exercises the cursor tiebreaker
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      });
      tickets.push({ id: t.id, team: s.team, assignee: s.assignee });
    }

    return { ...ws, teamA, teamB, leadA, agentA, agentB, admin, orphanLead, customer, tickets };
  });
}

export async function seedFixture(): Promise<Fixture> {
  const primary = await seedWorkspace('a');
  const other = await seedWorkspace('b');
  return { ...primary, other };
}

export async function cleanup() {
  try {
    await emptyWorkspaces();
    // Global and OUTSIDE row-level security, so this one has to carry the tag:
    // an unqualified delete here would empty the whole users table.
    await prisma.user.deleteMany({ where: { name: { startsWith: TAG } } });
  } finally {
    // Retired even if something above failed, and the failure still propagates.
    // A fixture workspace left `active` makes app_active_workspaces() answer
    // "more than one" for good, which switches off the tenant-of-one fallback
    // and 403s every login on that database until somebody notices.
    await retireWorkspaces();
    await prisma.$disconnect();
  }
}

async function emptyWorkspaces() {
  for (const workspaceId of createdWorkspaces) {
    await inWorkspace(workspaceId, async () => {
      // Unfiltered on purpose. Bound, the policy itself is the filter: these
      // statements cannot reach a row of any other workspace, and if the binding
      // were ever lost they would delete nothing at all rather than something
      // else's data. That fail-closed direction is what makes an unqualified
      // deleteMany the SAFEST form here — and it is exactly why `users` below is
      // not written this way.
      //
      // Order is dictated by the composite foreign keys the tenancy migration
      // added: everything that names a membership (api_keys.created_by and
      // canned_responses.created_by are RESTRICT) goes before memberships, and
      // memberships go before teams, which they reference with RESTRICT too.
      await prisma.ticketMessage.deleteMany({});
      await prisma.chatSession.deleteMany({});
      await prisma.notification.deleteMany({});
      await prisma.ticket.deleteMany({});
      await prisma.cannedResponse.deleteMany({});
      await prisma.apiKey.deleteMany({});
      await prisma.customer.deleteMany({});
      await prisma.slaPolicy.deleteMany({});
      await prisma.auditLog.deleteMany({});
      // Before memberships, and for the same reason api_keys is: invitations
      // .invited_by is a composite FK to (workspace_id, user_id) with ON DELETE
      // RESTRICT, because who invited whom is history and deactivation is the
      // offboarding path. A leftover invitation makes the next line fail on a
      // foreign key rather than on anything a reader would recognise.
      await prisma.invitation.deleteMany({});
      await prisma.workspaceMembership.deleteMany({});
      await prisma.team.deleteMany({});
    });
  }
}

/**
 * Removes the tenant rows themselves — or retires them when the runtime is not
 * allowed to.
 *
 * The tenancy migration ends with `REVOKE DELETE ON workspaces FROM plumo_app`,
 * deliberately: the runtime must not be able to erase a tenant. These tests
 * connect as plumo_app (global-setup.ts refuses anything more privileged,
 * because an isolation test run as the owner or a superuser passes whether or
 * not a policy exists), so they inherit that restriction and CANNOT delete the
 * workspaces they create.
 *
 * The row is retired to `deleting` instead, which is the lifecycle state the
 * schema provides for exactly this. That choice matters beyond tidiness:
 * `app_active_workspaces()` returns only `active` desks, so a retired fixture
 * cannot make WorkspaceContextService's tenant-of-one probe see several
 * workspaces and disable itself — which would 403 every login in any dev
 * database that had ever run this suite.
 *
 * The empty rows are inert. Remove them, and the per-workspace ticket-number
 * sequence each one's AFTER INSERT trigger created, with the migrator
 * credential — minus the `?schema=` suffix, which is Prisma's and which libpq
 * rejects as an invalid URI query parameter:
 *   psql "${MIGRATE_DATABASE_URL%%\?*}" \
 *     -c "SELECT 'DROP SEQUENCE ' || workspace_number_sequence(id) || ';'
 *           FROM workspaces WHERE slug LIKE 'itest-%'" \
 *     -c "DELETE FROM workspaces WHERE slug LIKE 'itest-%'"
 *
 * The privilege is probed rather than assumed because roles.sql's unconditional
 * `GRANT ... ON ALL TABLES` undoes the revoke on its next run, so a database
 * where roles.sql was replayed after the migrations really does differ from CI.
 * That is a fault, not a supported configuration — db-roles.integration.spec.ts
 * fails on it — but cleanup has to leave the database tidy either way rather
 * than die on a permission error while removing its own fixtures.
 */
async function retireWorkspaces() {
  if (createdWorkspaces.length === 0) return;
  const ids = createdWorkspaces.splice(0);

  const [privilege] = await prisma.$queryRaw<Array<{ mayDelete: boolean }>>`
    SELECT has_table_privilege(current_user, 'workspaces', 'DELETE') AS "mayDelete"
  `;

  if (privilege?.mayDelete) {
    await prisma.workspace.deleteMany({ where: { id: { in: ids } } });
  } else {
    await prisma.workspace.updateMany({ where: { id: { in: ids } }, data: { status: 'deleting' } });
  }
}

/**
 * Restrict any query to this run's fixtures, so dev rows never leak in.
 *
 * NOT what provides tenant separation any more — the policy does that, and this
 * filter matches BOTH fixture workspaces by design, so a spec that binds one
 * workspace and still sees the other's rows fails on the count rather than being
 * masked by the filter.
 */
export const onlyOurs = { subject: { startsWith: TAG } };

export const asUser = (workspaceId: string, id: string, role: Role, teamId: string | null): Principal => ({
  kind: 'user', workspaceId, id, role, teamId,
});

export const asKey = (workspaceId: string, teamId: string | null, scopes = ['tickets:read']): Principal => ({
  kind: 'api_key', workspaceId, id: 'key-1', scopes, teamId,
});
