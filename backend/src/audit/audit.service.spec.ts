import { AuditService } from './audit.service';
import type { Principal } from '../common/decorators';

/**
 * AuditLog.id is a Postgres bigint. Left as a BigInt it reaches Fastify's
 * JSON.stringify and throws, which took out both audit endpoints with a 500.
 */
describe('AuditService', () => {
  function makeService(rows: Array<Record<string, unknown>> = []) {
    const prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(rows.length),
      },
    };
    return { service: new AuditService(prisma as never), prisma };
  }

  const row = (id: bigint) => ({ id, actorType: 'user', actorId: 'u1', entityType: 'ticket', entityId: 'tk1', action: 'update', diffJson: {}, createdAt: new Date() });

  it('serializes bigint ids so the response can be JSON-encoded', async () => {
    const { service } = makeService([row(1n), row(2n)]);
    const out = await service.forEntity('ticket', 'tk1');
    expect(typeof out[0].id).toBe('number');
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it('serializes bigint ids on the global search path too', async () => {
    const { service } = makeService([row(99n)]);
    const out = await service.search({});
    expect(typeof out.data[0].id).toBe('number');
    expect(out.total).toBe(1);
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it('preserves the id value exactly', async () => {
    const { service } = makeService([row(4242n)]);
    const [entry] = await service.forEntity('ticket', 'tk1');
    expect(entry.id).toBe(4242);
  });

  describe('write', () => {
    const call = (prisma: { auditLog: { create: jest.Mock } }) => prisma.auditLog.create.mock.calls[0][0].data;

    it('records a human actor', async () => {
      const { service, prisma } = makeService();
      const actor: Principal = { kind: 'user', id: 'u1', role: 'lead', teamId: 't1' };
      await service.write({ actor, entityType: 'ticket', entityId: 'tk1', action: 'update', diff: { a: 1 } });
      expect(call(prisma)).toMatchObject({ actorType: 'user', actorId: 'u1', action: 'update' });
    });

    it('records a machine actor', async () => {
      const { service, prisma } = makeService();
      const actor: Principal = { kind: 'api_key', id: 'k1', scopes: ['tickets:write'] };
      await service.write({ actor, entityType: 'ticket', entityId: 'tk1', action: 'create' });
      expect(call(prisma)).toMatchObject({ actorType: 'api_key', actorId: 'k1' });
    });

    it('falls back to a system actor when there is none', async () => {
      const { service, prisma } = makeService();
      await service.write({ actor: null, entityType: 'export', entityId: 'e1', action: 'export.daily' });
      expect(call(prisma)).toMatchObject({ actorType: 'system', actorId: null });
    });
  });
});
