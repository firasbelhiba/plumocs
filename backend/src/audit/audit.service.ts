import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Principal } from '../common/decorators';

/** Central audit-write helper — every mutation records actor, action, and diff. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(params: {
    actor: Principal | null;
    entityType: string;
    entityId: string;
    action: string;
    diff?: unknown;
  }) {
    const { actor, entityType, entityId, action, diff } = params;
    await this.prisma.auditLog.create({
      data: {
        actorType: actor ? (actor.kind === 'user' ? 'user' : 'api_key') : 'system',
        actorId: actor?.id ?? null,
        entityType,
        entityId,
        action,
        diffJson: diff === undefined ? undefined : (diff as object),
      },
    });
  }

  /** AuditLog.id is a BigInt — convert before it reaches JSON serialization. */
  private serialize<T extends { id: bigint }>(row: T) {
    return { ...row, id: Number(row.id) };
  }

  async forEntity(entityType: string, entityId: string, limit = 50) {
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => this.serialize(r));
  }

  async search(params: { entityType?: string; actorId?: string; offset?: number; limit?: number }) {
    const { entityType, actorId, offset = 0, limit = 50 } = params;
    const where = {
      ...(entityType ? { entityType } : {}),
      ...(actorId ? { actorId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data: data.map((r) => this.serialize(r)), total };
  }
}
