import { PrismaClient } from '@prisma/client';
import type { Principal } from '../../src/common/decorators';

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
 */
export const prisma = new PrismaClient();

/** Unique per run so parallel/aborted runs never collide. */
export const TAG = `itest-${process.pid}-${Math.floor(Math.random() * 1e6)}`;

export interface Fixture {
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

export async function seedFixture(): Promise<Fixture> {
  const teamA = (await prisma.team.create({ data: { name: `${TAG}-teamA` } })).id;
  const teamB = (await prisma.team.create({ data: { name: `${TAG}-teamB` } })).id;

  const mkUser = (name: string, role: 'agent' | 'lead' | 'admin', team: string | null) =>
    prisma.user.create({
      data: { name: `${TAG}-${name}`, email: `${TAG}-${name}@itest.invalid`, role, teamId: team, passwordHash: 'x' },
    });

  const leadA = (await mkUser('leadA', 'lead', teamA)).id;
  const agentA = (await mkUser('agentA', 'agent', teamA)).id;
  const agentB = (await mkUser('agentB', 'agent', teamB)).id;
  const admin = (await mkUser('admin', 'admin', teamA)).id;
  const orphanLead = (await mkUser('orphanLead', 'lead', null)).id;

  const customer = (
    await prisma.customer.create({ data: { name: `${TAG}-cust`, email: `${TAG}-cust@itest.invalid` } })
  ).id;

  const spec: Array<{ team: 'A' | 'B' | null; assignee: string | null; tags: string[] }> = [
    { team: 'A', assignee: agentA, tags: ['billing', 'bug'] },
    { team: 'A', assignee: null, tags: ['billing'] },
    { team: 'A', assignee: agentB, tags: [] },          // cross-team assignment
    { team: 'B', assignee: agentB, tags: ['billing'] },
    { team: 'B', assignee: null, tags: ['bug'] },
    { team: null, assignee: null, tags: [] },            // unrouted
  ];

  const tickets: Fixture['tickets'] = [];
  for (const [i, s] of spec.entries()) {
    const t = await prisma.ticket.create({
      data: {
        subject: `${TAG}-ticket-${i}`,
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

  return { teamA, teamB, leadA, agentA, agentB, admin, orphanLead, customer, tickets };
}

export async function cleanup() {
  await prisma.ticketMessage.deleteMany({ where: { ticket: { subject: { startsWith: TAG } } } });
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: TAG } } });
  await prisma.apiKey.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.team.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.$disconnect();
}

/** Restrict any query to this run's fixtures, so dev rows never leak in. */
export const onlyOurs = { subject: { startsWith: TAG } };

export const asUser = (id: string, role: 'agent' | 'lead' | 'admin', teamId: string | null): Principal => ({
  kind: 'user', id, role, teamId,
});

export const asKey = (teamId: string | null, scopes = ['tickets:read']): Principal => ({
  kind: 'api_key', id: 'key-1', scopes, teamId,
});
