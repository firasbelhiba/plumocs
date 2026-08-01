import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AllowApiKey, CurrentUser, Principal, Roles, Scopes } from '../common/decorators';

class CreateCustomerDto {
  @IsEmail() email!: string;
  @IsString() name!: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() externalRef?: string;
}

/** "3h 20m" / "45m" / "2d" — the shape the console renders directly. */
function fmtMins(mins: number | null): string | null {
  if (mins == null) return null;
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 48 * 60) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
  }
  return `${Math.round(mins / 1440)}d`;
}

class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() externalRef?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q?: string, offset = 0, limit = 25) {
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { organization: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    // open/total ticket counts + last contact per customer
    const ids = rows.map((r) => r.id);
    const [grouped, lastByCustomer] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['customerId', 'status'],
        where: { customerId: { in: ids } },
        _count: true,
      }),
      this.prisma.ticket.groupBy({
        by: ['customerId'],
        where: { customerId: { in: ids } },
        _max: { updatedAt: true },
      }),
    ]);
    const counts: Record<string, { open: number; total: number }> = {};
    for (const g of grouped) {
      const c = (counts[g.customerId] ??= { open: 0, total: 0 });
      c.total += g._count;
      if (!['resolved', 'closed'].includes(g.status)) c.open += g._count;
    }
    const lastContact = new Map(lastByCustomer.map((g) => [g.customerId, g._max.updatedAt]));
    return {
      data: rows.map((r) => ({
        ...r,
        tickets: counts[r.id] ?? { open: 0, total: 0 },
        lastContact: lastContact.get(r.id) ?? null,
      })),
      page: { offset, limit, total },
    };
  }

  /** Profile + ticket history + the stats the profile header renders. */
  async get(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        organization: true,
        tickets: {
          select: {
            id: true, number: true, subject: true, status: true, priority: true,
            createdAt: true, updatedAt: true, resolvedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const tickets = customer.tickets;
    const resolved = tickets.filter((t) => t.resolvedAt);
    const avgMins = resolved.length
      ? resolved.reduce((sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60_000, 0) / resolved.length
      : null;
    const lastSeen = tickets.length ? Math.max(...tickets.map((t) => t.updatedAt.getTime())) : null;

    return {
      ...customer,
      // number is BigInt — Number() here keeps the shape explicit for clients
      tickets: tickets.map((t) => ({ ...t, number: Number(t.number) })),
      stats: {
        total: tickets.length,
        open: tickets.filter((t) => !['resolved', 'closed'].includes(t.status)).length,
        avgResolution: fmtMins(avgMins),
        lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
      },
    };
  }

  async create(dto: CreateCustomerDto, actor: Principal) {
    const customer = await this.prisma.customer.create({ data: dto });
    await this.audit.write({ actor, entityType: 'customer', entityId: customer.id, action: 'create' });
    return customer;
  }

  /**
   * Find-or-create by email — used by ticket creation and the inbound mail job.
   *
   * `findFirst`, not `findUnique`: since chatbot ingest made email nullable, its
   * uniqueness lives in the partial index customers_email_unique_idx
   * (WHERE email IS NOT NULL), which Prisma cannot express as `@unique`.
   *
   * The P2023/P2002 retry is not defensive padding. Two first-contact messages
   * from the same address arriving together — an ordinary chatbot burst — both
   * miss the read and both insert, and the loser previously surfaced as a 500.
   * The index is the real arbiter; this just re-reads what it rejected.
   */
  async findOrCreateByEmail(email: string, name?: string) {
    const existing = await this.prisma.customer.findFirst({ where: { email } });
    if (existing) return existing;

    const domain = email.split('@')[1];
    const org = domain ? await this.prisma.organization.findFirst({ where: { domain } }) : null;
    try {
      return await this.prisma.customer.create({
        data: { email, name: name || email.split('@')[0], organizationId: org?.id ?? null },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await this.prisma.customer.findFirst({ where: { email } });
        if (raced) return raced;
      }
      throw e;
    }
  }

  /**
   * Find-or-create a visitor a chatbot knows only by its own opaque reference.
   *
   * Anonymous visitors are identified by (chatbot, visitorRef) rather than by a
   * synthetic email address, because findOrCreateByEmail above infers company
   * membership from the email domain — so every synthetic visitor would be filed
   * under a fake organisation.
   */
  async findOrCreateVisitor(apiKeyId: string, visitorRef: string, name?: string) {
    const existing = await this.prisma.customer.findFirst({
      where: { visitorApiKeyId: apiKeyId, visitorRef },
    });
    if (existing) return existing;
    try {
      return await this.prisma.customer.create({
        data: {
          visitorApiKeyId: apiKeyId,
          visitorRef,
          name: name || 'Visitor',
          email: null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await this.prisma.customer.findFirst({
          where: { visitorApiKeyId: apiKeyId, visitorRef },
        });
        if (raced) return raced;
      }
      throw e;
    }
  }

  /**
   * A visitor who has now given an email stops being anonymous.
   *
   * If that address already belongs to a customer we return the existing one
   * rather than merging records — there is no customer-merge operation anywhere
   * in this codebase and building one is its own piece of work. The visitor row
   * is left in place, so no ticket history is lost either way.
   */
  async identifyVisitor(customerId: string, email: string, name?: string) {
    const owner = await this.prisma.customer.findFirst({ where: { email } });
    if (owner && owner.id !== customerId) return owner;

    const domain = email.split('@')[1];
    const org = domain ? await this.prisma.organization.findFirst({ where: { domain } }) : null;
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        email,
        ...(name ? { name } : {}),
        ...(org ? { organizationId: org.id } : {}),
      },
    });
  }

  async update(id: string, dto: UpdateCustomerDto, actor: Principal) {
    const customer = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.write({ actor, entityType: 'customer', entityId: id, action: 'update' });
    return customer;
  }

  /** Admin-only PII erasure — anonymizes rather than breaking ticket history. */
  async anonymize(id: string, actor: Principal) {
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name: 'Deleted customer',
        email: `deleted-${id}@anonymized.invalid`,
        phone: null,
        externalRef: null,
      },
    });
    await this.audit.write({ actor, entityType: 'customer', entityId: id, action: 'anonymize' });
    return customer;
  }
}

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @AllowApiKey()
  @Scopes('customers:read')
  list(@Query('q') q?: string, @Query('offset') offset = '0', @Query('limit') limit = '25') {
    return this.customers.list(q, parseInt(offset, 10), Math.min(parseInt(limit, 10), 100));
  }

  @Get(':id')
  @AllowApiKey()
  @Scopes('customers:read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.get(id);
  }

  @Post()
  @AllowApiKey()
  @Scopes('customers:write')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() principal: Principal) {
    return this.customers.create(dto, principal);
  }

  @Patch(':id')
  @AllowApiKey()
  @Scopes('customers:write')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() principal: Principal) {
    return this.customers.update(id, dto, principal);
  }

  @Delete(':id')
  @Roles('admin')
  anonymize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.customers.anonymize(id, principal);
  }
}

@Module({
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
