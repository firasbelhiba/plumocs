import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Principal, Roles } from '../common/decorators';

// API names use dots; the DB enum uses mapped values.
export const EVENT_API_TO_DB: Record<string, string> = {
  'ticket.created': 'ticket_created',
  'ticket.updated': 'ticket_updated',
  'ticket.assigned': 'ticket_assigned',
  'ticket.resolved': 'ticket_resolved',
  'message.added': 'message_added',
  'sla.breached': 'sla_breached',
};
export const EVENT_DB_TO_API = Object.fromEntries(Object.entries(EVENT_API_TO_DB).map(([k, v]) => [v, k]));

class CreateWebhookDto {
  @IsUrl({ require_tld: false }) url!: string;
  @IsArray() @ArrayNotEmpty() @IsIn(Object.keys(EVENT_API_TO_DB), { each: true })
  events!: string[];
  @IsOptional() @IsString() secret?: string;
}

class UpdateWebhookDto {
  @IsOptional() @IsUrl({ require_tld: false }) url?: string;
  @IsOptional() @IsArray() @IsIn(Object.keys(EVENT_API_TO_DB), { each: true })
  events?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const hooks = await this.prisma.webhook.findMany({
      include: {
        deliveries: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { deliveries: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return hooks.map((h) => ({
      id: h.id,
      url: h.url,
      events: h.events.map((e) => EVENT_DB_TO_API[e] ?? e),
      isActive: h.isActive,
      lastDelivery: h.deliveries[0] ?? null,
      deliveryCount: h._count.deliveries,
      createdAt: h.createdAt,
    }));
  }

  async create(dto: CreateWebhookDto, actor: Principal) {
    const secret = dto.secret ?? randomBytes(24).toString('hex');
    const hook = await this.prisma.webhook.create({
      data: {
        url: dto.url,
        events: dto.events.map((e) => EVENT_API_TO_DB[e]) as never,
        secret,
      },
    });
    await this.audit.write({ actor, entityType: 'webhook', entityId: hook.id, action: 'create' });
    // the secret is returned once, on create
    return { id: hook.id, url: hook.url, events: dto.events, secret, isActive: hook.isActive };
  }

  async update(id: string, dto: UpdateWebhookDto, actor: Principal) {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Webhook not found');
    const hook = await this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.events !== undefined ? { events: dto.events.map((e) => EVENT_API_TO_DB[e]) as never } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.write({ actor, entityType: 'webhook', entityId: id, action: 'update' });
    return { ...hook, secret: undefined, events: hook.events.map((e) => EVENT_DB_TO_API[e] ?? e) };
  }

  async remove(id: string, actor: Principal) {
    await this.prisma.webhook.delete({ where: { id } });
    await this.audit.write({ actor, entityType: 'webhook', entityId: id, action: 'delete' });
    return { ok: true };
  }

  deliveries(id: string) {
    return this.prisma.webhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @Roles('admin')
  list() {
    return this.webhooks.list();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateWebhookDto, @CurrentUser() principal: Principal) {
    return this.webhooks.create(dto, principal);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWebhookDto, @CurrentUser() principal: Principal) {
    return this.webhooks.update(id, dto, principal);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.webhooks.remove(id, principal);
  }

  @Get(':id/deliveries')
  @Roles('admin')
  deliveries(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.deliveries(id);
  }
}

@Module({
  providers: [WebhooksService],
  controllers: [WebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
