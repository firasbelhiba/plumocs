import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TeamScopeService } from '../common/guards/team-scope.service';
import { SlaService } from '../sla/sla.service';
import type { Principal } from '../common/decorators';

/**
 * Service-level rules that guards can't express: SLA marker preservation,
 * assignment authorization, and the assign()/patch() null-vs-absent contract.
 * Collaborators are stubbed — this is about the decision logic, not Prisma.
 */
describe('TicketsService', () => {
  const admin: Principal = { kind: 'user', workspaceId: 'w1', id: 'u-admin', role: 'admin', teamId: 't1' };
  const lead: Principal = { kind: 'user', workspaceId: 'w1', id: 'u-lead', role: 'lead', teamId: 't1' };
  const agent: Principal = { kind: 'user', workspaceId: 'w1', id: 'u-agent', role: 'agent', teamId: 't1' };

  const baseTicket = {
    id: 'tk-1',
    number: 1042n,
    status: 'open' as const,
    tags: ['billing'],
    teamId: 't1',
    assigneeId: 'u-agent',
    slaPausedAt: null,
    slaPolicyId: null,
    firstResponseDueAt: null,
    resolutionDueAt: null,
    subject: 'a subject',
    priority: 'normal' as const,
    outcome: null,
  };

  /** Builds a service whose prisma/update path we can observe. */
  function makeService(ticket: Record<string, unknown> = baseTicket, users: Record<string, unknown> = {}) {
    const updateSpy = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...ticket, ...data, number: 1042n }));
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(ticket), update: updateSpy, delete: jest.fn().mockResolvedValue(ticket) },
      user: { findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(users[where.id] ?? null)) },
      // Team and activation moved to the membership, so the guard reads that
      // table now. Derived from the SAME `users` fixture so each test still
      // states its case in one place — only the table underneath changed.
      workspaceMembership: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const u = users[where.workspaceId_userId.userId] as
            | { teamId?: string | null; isActive?: boolean; role?: string }
            | undefined;
          return Promise.resolve(
            u
              ? {
                  teamId: u.teamId ?? null,
                  role: u.role ?? 'agent',
                  isActive: u.isActive ?? true,
                  user: { isActive: u.isActive ?? true },
                }
              : null,
          );
        }),
      },
    };
    const scope = new TeamScopeService(prisma as never);
    const sla = new SlaService(prisma as never);
    const queue = { deliverWebhooks: jest.fn(), indexTicket: jest.fn(), notify: jest.fn() };
    const realtime = { publish: jest.fn() };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };

    const service = new TicketsService(
      prisma as never,
      audit as never,
      queue as never,
      sla,
      { findOrCreateByEmail: jest.fn() } as never,
      scope,
      realtime as never,
    );
    return { service, updateSpy, prisma, queue, audit };
  }

  describe('tag edits preserve SLA sweep markers', () => {
    it('keeps sla:* markers when a client sends a fresh tag list', async () => {
      const ticket = { ...baseTicket, tags: ['billing', 'sla:breached'] };
      const { service, updateSpy } = makeService(ticket);

      // the console never sees sla:* tags, so it posts the visible ones only
      await service.patch('tk-1', { tags: ['billing', 'urgent'] }, admin);

      const written = updateSpy.mock.calls[0][0].data.tags as string[];
      expect(written).toContain('sla:breached'); // would re-fire breach alerts if dropped
      expect(written).toEqual(expect.arrayContaining(['billing', 'urgent']));
    });

    it('ignores a client trying to set its own sla:* marker', async () => {
      const { service, updateSpy } = makeService({ ...baseTicket, tags: [] });
      await service.patch('tk-1', { tags: ['billing', 'sla:breached'] }, admin);
      expect(updateSpy.mock.calls[0][0].data.tags).toEqual(['billing']);
    });

    it('does not duplicate a marker already present', async () => {
      const ticket = { ...baseTicket, tags: ['sla:due-soon'] };
      const { service, updateSpy } = makeService(ticket);
      await service.patch('tk-1', { tags: ['sla:due-soon', 'bug'] }, admin);
      const written = updateSpy.mock.calls[0][0].data.tags as string[];
      expect(written.filter((t) => t === 'sla:due-soon')).toHaveLength(1);
    });
  });

  describe('assignment authorization', () => {
    it('lets an agent self-assign inside their team', async () => {
      const { service } = makeService({ ...baseTicket, assigneeId: null });
      await expect(service.patch('tk-1', { assigneeId: 'u-agent' }, agent)).resolves.toBeDefined();
    });

    it('stops an agent handing work to somebody else', async () => {
      const { service } = makeService({ ...baseTicket, assigneeId: null });
      await expect(service.patch('tk-1', { assigneeId: 'u-other' }, agent)).rejects.toThrow(ForbiddenException);
    });

    it('stops an agent self-assigning from another team', async () => {
      const { service } = makeService({ ...baseTicket, teamId: 't2', assigneeId: 'u-agent' });
      await expect(service.patch('tk-1', { assigneeId: 'u-agent' }, agent)).rejects.toThrow(ForbiddenException);
    });

    it('lets a lead assign somebody in their own team', async () => {
      const { service } = makeService(baseTicket, { 'u-mate': { teamId: 't1', isActive: true } });
      await expect(service.patch('tk-1', { assigneeId: 'u-mate' }, lead)).resolves.toBeDefined();
    });

    it("stops a lead assigning another team's agent", async () => {
      const { service } = makeService(baseTicket, { 'u-far': { teamId: 't2', isActive: true } });
      await expect(service.patch('tk-1', { assigneeId: 'u-far' }, lead)).rejects.toThrow(ForbiddenException);
    });

    it('refuses assignment to a deactivated user', async () => {
      const { service } = makeService(baseTicket, { 'u-gone': { teamId: 't1', isActive: false } });
      await expect(service.patch('tk-1', { assigneeId: 'u-gone' }, lead)).rejects.toThrow();
    });
  });

  describe('team moves', () => {
    it('agents cannot move tickets between teams', async () => {
      const { service } = makeService();
      await expect(service.patch('tk-1', { teamId: 't2' }, agent)).rejects.toThrow(ForbiddenException);
    });

    it('a lead cannot push a ticket into a team they do not lead', async () => {
      const { service } = makeService();
      await expect(service.patch('tk-1', { teamId: 't2' }, lead)).rejects.toThrow(ForbiddenException);
    });

    it('an admin can move a ticket anywhere', async () => {
      const { service } = makeService();
      await expect(service.patch('tk-1', { teamId: 't2' }, admin)).resolves.toBeDefined();
    });
  });

  describe('assign() distinguishes absent from null', () => {
    it('a team-only move leaves the assignee alone', async () => {
      const { service, updateSpy } = makeService();
      await service.assign('tk-1', { teamId: 't2' }, admin);
      // no assignee key at all — the holder keeps the ticket
      expect(updateSpy.mock.calls[0][0].data).not.toHaveProperty('assignee');
    });

    it('an explicit null unassigns', async () => {
      const { service, updateSpy } = makeService();
      await service.assign('tk-1', { assigneeId: null }, admin);
      expect(updateSpy.mock.calls[0][0].data.assignee).toEqual({ disconnect: true });
    });

    it('"me" resolves to the caller', async () => {
      const { service, updateSpy } = makeService();
      await service.assign('tk-1', { assigneeId: 'me' }, admin);
      expect(updateSpy.mock.calls[0][0].data.assignee).toEqual({ connect: { id: 'u-admin' } });
    });
  });

  describe('state transitions', () => {
    it('rejects an illegal move with 422', async () => {
      const { service } = makeService({ ...baseTicket, status: 'closed' });
      await expect(service.patch('tk-1', { status: 'pending' }, admin)).rejects.toMatchObject({ status: 422 });
    });

    it('an agent cannot reopen a closed conversation', async () => {
      const { service } = makeService({ ...baseTicket, status: 'closed' });
      await expect(service.patch('tk-1', { status: 'open' }, agent)).rejects.toThrow(ForbiddenException);
    });

    it('a lead can reopen, and the resolved/closed stamps are cleared', async () => {
      const { service, updateSpy } = makeService({ ...baseTicket, status: 'closed' });
      await service.patch('tk-1', { status: 'open' }, lead);
      const data = updateSpy.mock.calls[0][0].data;
      expect(data.status).toBe('open');
      expect(data.resolvedAt).toBeNull();
      expect(data.closedAt).toBeNull();
    });

    it('moving to pending pauses the SLA clock', async () => {
      const { service, updateSpy } = makeService();
      await service.patch('tk-1', { status: 'pending' }, admin);
      expect(updateSpy.mock.calls[0][0].data.slaPausedAt).toBeInstanceOf(Date);
    });
  });

  describe('bulk actions', () => {
    it('are closed to agents', async () => {
      const { service } = makeService();
      await expect(service.bulk({ ids: ['tk-1'], action: 'close' }, agent)).rejects.toThrow(ForbiddenException);
    });

    it('report per-ticket outcomes rather than failing the whole batch', async () => {
      const { service, prisma } = makeService();
      prisma.ticket.findUnique
        .mockResolvedValueOnce(baseTicket)
        .mockResolvedValueOnce(null); // second id does not exist
      const res = await service.bulk({ ids: ['tk-1', 'tk-missing'], action: 'close' }, admin);
      expect(res.results).toHaveLength(2);
      expect(res.results[0].ok).toBe(true);
      expect(res.results[1].ok).toBe(false);
    });
  });

  describe('merge', () => {
    it('refuses merging a ticket into itself', async () => {
      const { service } = makeService();
      await expect(service.merge('tk-1', 'tk-1', admin)).rejects.toMatchObject({ status: 422 });
    });

    it('is closed to agents', async () => {
      const { service } = makeService();
      await expect(service.merge('tk-1', 'tk-2', agent)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create routing', () => {
    // regression: create() read the team as
    //   dto.teamId ?? (actor.kind === 'user' ? actor.teamId : null) ?? defaultTeamId()
    // so a machine caller's own team was discarded, dto.teamId was taken on
    // trust, and only agents were checked. A chatbot key bound to one team could
    // file tickets into another and then not be able to read them back.
    const boundKey: Principal = { kind: 'api_key', workspaceId: 'w1', id: 'k1', scopes: ['tickets:write'], teamId: 't1' };
    const unboundKey: Principal = { kind: 'api_key', workspaceId: 'w1', id: 'k2', scopes: ['tickets:write'], teamId: null };

    function makeCreateService(users: Record<string, unknown> = {}) {
      const created: Record<string, unknown>[] = [];
      const prisma = {
        ticket: {
          create: jest.fn().mockImplementation(({ data }) => {
            created.push(data);
            return Promise.resolve({ ...baseTicket, ...data, id: 'tk-new', number: 1n, customer: null });
          }),
          groupBy: jest.fn().mockResolvedValue([]),
        },
        team: { findFirst: jest.fn().mockResolvedValue({ id: 't-default' }) },
        user: {
          findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(users[where.id] ?? null)),
          findMany: jest.fn().mockResolvedValue([]),
        },
        // Team and activation moved to the membership, so the guard reads that
        // table now. Derived from the SAME `users` fixture so each test still
        // states its case in one place — only the table underneath changed.
        workspaceMembership: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            const u = users[where.workspaceId_userId.userId] as
                | { teamId?: string | null; isActive?: boolean; role?: string }
                | undefined;
            return Promise.resolve(
                u
                  ? {
                        teamId: u.teamId ?? null,
                        role: u.role ?? 'agent',
                        isActive: u.isActive ?? true,
                        user: { isActive: u.isActive ?? true },
                    }
                  : null,
            );
          }),
          // The round-robin pool reads memberships now (it needs availability
          // and per-desk activation). Empty by default, as user.findMany was —
          // these tests are about which TEAM is chosen, not who gets it.
          findMany: jest.fn().mockResolvedValue([]),
        },
        customer: { findUniqueOrThrow: jest.fn() },
      };
      const service = new TicketsService(
        prisma as never,
        { write: jest.fn().mockResolvedValue(undefined) } as never,
        { deliverWebhooks: jest.fn(), indexTicket: jest.fn(), notify: jest.fn() } as never,
        { computeDueTimes: jest.fn().mockResolvedValue({ policyId: null, firstResponseDueAt: null, resolutionDueAt: null }) } as never,
        { findOrCreateByEmail: jest.fn().mockResolvedValue({ id: 'c1', organizationId: null }) } as never,
        new TeamScopeService(prisma as never),
        { publish: jest.fn() } as never,
      );
      return { service, created, prisma };
    }

    const dto = { subject: 'hello', customerEmail: 'a@b.test' } as never;

    it("uses the key's own team rather than the instance default", async () => {
      const { service, created } = makeCreateService();
      await service.create(dto, boundKey);
      expect(created[0].teamId).toBe('t1'); // not 't-default'
    });

    it('refuses a key writing into a team it is not bound to', async () => {
      const { service } = makeCreateService();
      await expect(service.create({ ...(dto as object), teamId: 't2' } as never, boundKey)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses a key assigning somebody outside its team', async () => {
      const { service } = makeCreateService({ 'u-far': { teamId: 't2', isActive: true } });
      await expect(service.create({ ...(dto as object), assigneeId: 'u-far' } as never, boundKey)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('still lets an unbound key route deliberately', async () => {
      const { service, created } = makeCreateService();
      await service.create({ ...(dto as object), teamId: 't2' } as never, unboundKey);
      expect(created[0].teamId).toBe('t2');
    });

    it('refuses a lead creating into another team, matching patch()', async () => {
      const { service } = makeCreateService();
      await expect(service.create({ ...(dto as object), teamId: 't2' } as never, lead)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses an agent creating into another team', async () => {
      const { service } = makeCreateService();
      await expect(service.create({ ...(dto as object), teamId: 't2' } as never, agent)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets an admin route anywhere', async () => {
      const { service, created } = makeCreateService();
      await service.create({ ...(dto as object), teamId: 't2' } as never, admin);
      expect(created[0].teamId).toBe('t2');
    });
  });

  describe('delete', () => {
    // regression: remove() called loadTicket without assertCanAccess, so any
    // principal who reached the route could delete a ticket outside their scope
    it('refuses to delete a ticket outside the actor’s team', async () => {
      const { service, prisma } = makeService({ ...baseTicket, teamId: 't2', assigneeId: null });
      await expect(service.remove('tk-1', lead)).rejects.toThrow(ForbiddenException);
      expect(prisma.ticket.delete).not.toHaveBeenCalled();
    });

    it('allows an admin to delete anything', async () => {
      const { service, prisma } = makeService({ ...baseTicket, teamId: 't2' });
      await expect(service.remove('tk-1', admin)).resolves.toEqual({ ok: true });
      expect(prisma.ticket.delete).toHaveBeenCalled();
    });
  });

  describe('missing tickets', () => {
    it('surface as 404, not a crash', async () => {
      const { service, prisma } = makeService();
      prisma.ticket.findUnique.mockResolvedValue(null);
      await expect(service.patch('nope', { priority: 'high' }, admin)).rejects.toThrow(NotFoundException);
    });
  });
});
