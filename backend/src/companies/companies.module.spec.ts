import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../common/guards/roles.guard';
import { type Principal } from '../common/decorators';
import { CompaniesController, CompaniesService } from './companies.module';

/**
 * These routes shipped with NO @Roles on any of the four, which meant any
 * authenticated member — an agent included — could create and edit companies.
 * The teeth are on `domain`: CustomersService.findOrCreateByEmail() files each
 * new customer under the company whose domain matches their address, so writing
 * `domain` decides whose customers land where.
 *
 * The guard is driven through the REAL Reflector against the REAL handler
 * functions rather than by reading a metadata key directly. RolesGuard.spec
 * already proves the guard's own logic with a stub reflector; what is unproven,
 * and what actually regressed here, is whether the decorators are ON THE ROUTES.
 * A test that read ROLES_KEY itself would pass just as happily against a
 * decorator Nest never sees.
 */
describe('CompaniesController route gating', () => {
  const guard = new RolesGuard(new Reflector());

  const ctxFor = (principal: Principal | undefined, handler: (...args: never[]) => unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ principal }) }),
      getHandler: () => handler,
      getClass: () => CompaniesController,
    }) as unknown as ExecutionContext;

  const agent: Principal = { kind: 'user', workspaceId: 'w1', id: 'a', role: 'agent', teamId: 't1' };
  const lead: Principal = { kind: 'user', workspaceId: 'w1', id: 'l', role: 'lead', teamId: 't1' };
  const admin: Principal = { kind: 'user', workspaceId: 'w1', id: 'ad', role: 'admin', teamId: 't1' };
  const chatbot: Principal = { kind: 'api_key', workspaceId: 'w1', id: 'k', scopes: ['customers:write', 'tickets:write'] };

  const reads = [
    ['GET /companies', CompaniesController.prototype.list],
    ['GET /companies/:id', CompaniesController.prototype.get],
  ] as const;

  const writes = [
    ['POST /companies', CompaniesController.prototype.create],
    ['PATCH /companies/:id', CompaniesController.prototype.update],
  ] as const;

  it('answers at /companies, not /organizations', () => {
    // The console calls `/companies` (frontend/lib/api/endpoints.js). If the
    // controller path drifted back, every company screen 404s.
    expect(Reflect.getMetadata(PATH_METADATA, CompaniesController)).toBe('companies');
  });

  describe('reads stay open to any member', () => {
    it.each(reads)('%s admits an agent', (_name, handler) => {
      expect(guard.canActivate(ctxFor(agent, handler))).toBe(true);
    });
  });

  describe('writes are admin-only', () => {
    it.each(writes)('%s refuses an agent', (_name, handler) => {
      expect(() => guard.canActivate(ctxFor(agent, handler))).toThrow(ForbiddenException);
    });

    // The regression this pins: 'lead' is what teams uses for adding MEMBERS,
    // while creating a team or a tag — workspace-wide structure, which is what a
    // company is — is 'admin' everywhere else in this codebase.
    it.each(writes)('%s refuses a lead', (_name, handler) => {
      expect(() => guard.canActivate(ctxFor(lead, handler))).toThrow(ForbiddenException);
    });

    it.each(writes)('%s admits an admin', (_name, handler) => {
      expect(guard.canActivate(ctxFor(admin, handler))).toBe(true);
    });

    // No @AllowApiKey/@Scopes here, so RolesGuard treats these as human-only.
    // A chatbot key that can already write customers and tickets still cannot
    // invent the company those customers get filed under.
    it.each(writes)('%s refuses an API key however scoped', (_name, handler) => {
      expect(() => guard.canActivate(ctxFor(chatbot, handler))).toThrow(ForbiddenException);
    });
  });
});

describe('CompaniesService', () => {
  function make() {
    const prisma = {
      company: {
        create: jest.fn().mockResolvedValue({ id: 'co-1', name: 'Northwind Health' }),
        update: jest.fn().mockResolvedValue({ id: 'co-1', name: 'Northwind Health AB' }),
      },
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    return { prisma, audit, service: new CompaniesService(prisma as never, audit as never) };
  }

  const actor: Principal = { kind: 'user', workspaceId: 'w1', id: 'ad', role: 'admin', teamId: null };

  // The audit vocabulary is part of the rename: audit_log rows are read by
  // entityType, and leaving 'organization' behind would hide every company edit
  // from a search for companies.
  it('audits creates and updates as entityType "company"', async () => {
    const { audit, service } = make();

    await service.create({ name: 'Northwind Health', domain: 'nw.com' }, actor);
    await service.update('co-1', { name: 'Northwind Health AB' }, actor);

    expect(audit.write).toHaveBeenNthCalledWith(1, expect.objectContaining({ entityType: 'company', action: 'create' }));
    expect(audit.write).toHaveBeenNthCalledWith(2, expect.objectContaining({ entityType: 'company', action: 'update' }));
  });
});
