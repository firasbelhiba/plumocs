import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Principal } from '../common/decorators';
import { TeamScopeService } from '../common/guards/team-scope.service';

/**
 * Ticket search — Postgres FTS in v1 via the trigger-maintained search_tsv
 * column (see prisma/sql/search_tsv.sql), with an ILIKE fallback when the
 * column has not been installed. Pluggable to OpenSearch later.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TeamScopeService,
  ) {}

  async search(q: string, principal: Principal, limit = 10) {
    if (!q?.trim()) return { tickets: [], customers: [] };

    let ticketIds: string[] = [];
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM tickets
          WHERE search_tsv @@ websearch_to_tsquery('english', ${q})
          ORDER BY ts_rank(search_tsv, websearch_to_tsquery('english', ${q})) DESC
          LIMIT ${limit * 3}`,
      );
      ticketIds = rows.map((r) => r.id);
    } catch {
      // search_tsv not installed — fall back to ILIKE
    }

    const visibility = this.scope.visibilityWhere(principal) as Prisma.TicketWhereInput;
    const asNumber = parseInt(q.replace(/^#/, ''), 10);
    const tickets = await this.prisma.ticket.findMany({
      where: {
        AND: [
          visibility,
          ticketIds.length
            ? { OR: [{ id: { in: ticketIds } }, ...(Number.isFinite(asNumber) ? [{ number: BigInt(asNumber) }] : [])] }
            : {
                OR: [
                  { subject: { contains: q, mode: 'insensitive' } },
                  ...(Number.isFinite(asNumber) ? [{ number: BigInt(asNumber) }] : []),
                ],
              },
        ],
      },
      select: { id: true, number: true, subject: true, status: true, priority: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true, company: { select: { name: true } } },
      take: 5,
    });

    return {
      tickets: tickets.map((t) => ({ ...t, number: Number(t.number) })),
      customers,
    };
  }
}

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(@Query('q') q: string, @CurrentUser() principal: Principal) {
    return this.search.search(q ?? '', principal);
  }
}

@Module({
  providers: [SearchService, TeamScopeService],
  controllers: [SearchController],
})
export class SearchModule {}
