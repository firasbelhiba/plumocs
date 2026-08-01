import { Controller, Get, HttpCode, Injectable, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { QueueProducer } from '../queue/queue.producer';
import { AllowApiKey, CurrentUser, Principal, Roles, Scopes } from '../common/decorators';

/**
 * Machine-facing endpoints (§6 IntegrationsModule). The HashCare escalation
 * path is the ordinary tickets API with an API key; this module adds the
 * export trigger and aggregate metrics for `reports:read` keys.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueProducer,
  ) {}

  async metrics() {
    const [open, breaching, resolved7d, byChannel] = await Promise.all([
      this.prisma.ticket.count({ where: { status: { in: ['new', 'open', 'pending', 'on_hold'] } } }),
      this.prisma.ticket.count({
        where: {
          status: { in: ['new', 'open'] },
          slaPausedAt: null,
          firstRespondedAt: null,
          firstResponseDueAt: { lt: new Date() },
        },
      }),
      this.prisma.ticket.count({
        where: { resolvedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      }),
      this.prisma.ticket.groupBy({ by: ['channel'], _count: true }),
    ]);
    return {
      openTickets: open,
      breachingFirstResponse: breaching,
      resolvedLast7Days: resolved7d,
      byChannel: Object.fromEntries(byChannel.map((c) => [c.channel, c._count])),
    };
  }

  async triggerExport(actor: Principal) {
    await this.queue.runExport({ requestedBy: actor.id });
    return { enqueued: true };
  }
}

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  /** Instance-wide, unscoped figures — admin (or a reports:read key) only. */
  @Get('metrics')
  @AllowApiKey()
  @Scopes('reports:read')
  @Roles('admin')
  metrics() {
    return this.integrations.metrics();
  }

  @Post('export/run')
  @HttpCode(202)
  @AllowApiKey()
  @Scopes('exports:run')
  @Roles('admin') // for humans; machines pass via the scope
  export(@CurrentUser() principal: Principal) {
    return this.integrations.triggerExport(principal);
  }
}

@Module({
  providers: [IntegrationsService],
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
