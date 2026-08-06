import { Controller, ForbiddenException, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Principal, AllowApiKey, Scopes } from '../common/decorators';
import { NO_TEAM } from '../common/guards/team-scope.service';

const DAY = 86_400_000;
const OPEN: Prisma.TicketWhereInput = { status: { in: ['new', 'open', 'pending', 'on_hold'] } };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const fmtMins = (mins: number | null) =>
  mins == null ? null : mins < 60 ? `${Math.round(mins)}m` : `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, '0')}m`;

/**
 * Reports (§8.3 matrix): agents see their own performance, leads their
 * team's, admins the instance. Scoping is resolved server-side from the
 * principal — a lead's requests are silently narrowed to their team.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the team filter the principal is allowed to see.
   *
   * This is the second encoding of the access rule (TeamScopeService holds the
   * other two). It differs deliberately — agents see only tickets assigned to
   * them here, not their whole team, because "own performance" is per-person —
   * but the machine and null-team cases must match, and
   * reports-scope.integration.spec.ts asserts that.
   *
   * The tenant pin belongs on every branch rather than at the call sites: an
   * admin's unfiltered branch is `{}`, so a report that added the team scope and
   * forgot the workspace would aggregate every desk on the instance into one
   * number. Team ids are only unique per workspace, so even the narrow branches
   * need it.
   */
  private teamScope(principal: Principal, requestedTeamId?: string): Prisma.TicketWhereInput {
    const workspaceId = principal.workspaceId;
    if (principal.kind === 'api_key') {
      // a key confined to a team cannot widen its own scope via ?teamId=
      if (principal.teamId) return { workspaceId, teamId: principal.teamId };
      return requestedTeamId ? { workspaceId, teamId: requestedTeamId } : { workspaceId };
    }
    if (principal.role === 'admin') {
      return requestedTeamId ? { workspaceId, teamId: requestedTeamId } : { workspaceId };
    }
    if (principal.role === 'lead') {
      return { workspaceId, teamId: principal.teamId ?? NO_TEAM };
    }
    // agents: own tickets only
    return { workspaceId, assigneeId: principal.id };
  }

  /** The five KPIs behind the console's reports screen. */
  async summary(principal: Principal, teamId?: string) {
    const scope = this.teamScope(principal, teamId);
    const since7d = new Date(Date.now() - 7 * DAY);

    const [open, respondedRows, resolvedRows] = await Promise.all([
      this.prisma.ticket.count({ where: { AND: [scope, OPEN] } }),
      this.prisma.ticket.findMany({
        where: { AND: [scope, { firstRespondedAt: { gte: since7d } }] },
        select: { createdAt: true, firstRespondedAt: true },
      }),
      this.prisma.ticket.findMany({
        where: { AND: [scope, { resolvedAt: { gte: since7d } }] },
        select: { createdAt: true, resolvedAt: true, resolutionDueAt: true },
      }),
    ]);

    const frMedian = median(respondedRows.map((t) => (t.firstRespondedAt!.getTime() - t.createdAt.getTime()) / 60_000));
    const resMedian = median(resolvedRows.map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60_000));
    // met = resolved before (or without) a due time
    const metCount = resolvedRows.filter((t) => !t.resolutionDueAt || t.resolvedAt! <= t.resolutionDueAt).length;

    return {
      openTickets: open,
      firstResponseMedian: fmtMins(frMedian),
      firstResponseMedianMins: frMedian,
      resolutionMedian: fmtMins(resMedian),
      resolutionMedianMins: resMedian,
      slaMetPct: resolvedRows.length === 0 ? null : Math.round((metCount / resolvedRows.length) * 100),
      resolvedLast7Days: resolvedRows.length,
    };
  }

  /** Created vs resolved per day. */
  async volume(principal: Principal, days = 7, teamId?: string) {
    const scope = this.teamScope(principal, teamId);
    const since = new Date(Date.now() - days * DAY);
    const [created, resolved] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { AND: [scope, { createdAt: { gte: since } }] },
        select: { createdAt: true },
      }),
      this.prisma.ticket.findMany({
        where: { AND: [scope, { resolvedAt: { gte: since } }] },
        select: { resolvedAt: true },
      }),
    ]);

    const buckets: Record<string, { d: string; created: number; resolved: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      buckets[day] = { d: day, created: 0, resolved: 0 };
    }
    for (const t of created) {
      const day = t.createdAt.toISOString().slice(0, 10);
      if (buckets[day]) buckets[day].created++;
    }
    for (const t of resolved) {
      const day = t.resolvedAt!.toISOString().slice(0, 10);
      if (buckets[day]) buckets[day].resolved++;
    }
    return Object.values(buckets);
  }

  /** Where conversations come from (last N days). */
  async byChannel(principal: Principal, days = 7, teamId?: string) {
    const scope = this.teamScope(principal, teamId);
    const since = new Date(Date.now() - days * DAY);
    const rows = await this.prisma.ticket.groupBy({
      by: ['channel'],
      where: { AND: [scope, { createdAt: { gte: since } }] },
      _count: true,
    });
    return rows.map((r) => ({ channel: r.channel, count: r._count })).sort((a, b) => b.count - a.count);
  }

  /** Per-agent open / resolved / average resolution. Agents see only their own row. */
  async byAgent(principal: Principal, days = 7, teamId?: string) {
    const isAgent = principal.kind === 'user' && principal.role === 'agent';
    // a lead with no team must not fall through to "every active user";
    // a team-bound key cannot widen its scope via ?teamId=
    const scopeTeam =
      principal.kind === 'api_key'
        ? (principal.teamId ?? teamId)
        : principal.role === 'admin'
          ? teamId
          : (principal.teamId ?? NO_TEAM);

    // The roster comes from workspace_memberships, not users: role and team are
    // per-desk now, so a user row can no longer answer "who are this team's
    // agents". Both active flags are checked — `isActive` here is "still on this
    // desk" and `user.isActive` is "may authenticate at all"; either one alone
    // would put an offboarded person back on the report.
    const members = await this.prisma.workspaceMembership.findMany({
      where: {
        workspaceId: principal.workspaceId,
        isActive: true,
        user: { isActive: true },
        ...(isAgent ? { userId: principal.id } : {}),
        ...(scopeTeam ? { teamId: scopeTeam } : {}),
      },
      select: { userId: true, role: true, teamId: true, user: { select: { name: true } } },
    });
    const agents = members.map((m) => ({ id: m.userId, name: m.user.name, role: m.role, teamId: m.teamId }));
    const ids = agents.map((a) => a.id);
    const since = new Date(Date.now() - days * DAY);

    // `assigneeId in ids` is not itself a tenant filter: the same human can hold
    // memberships on two desks, and their tickets over there would otherwise be
    // counted into this desk's numbers.
    const [openCounts, resolvedRows] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['assigneeId'],
        where: { workspaceId: principal.workspaceId, assigneeId: { in: ids }, ...OPEN },
        _count: true,
      }),
      this.prisma.ticket.findMany({
        where: { workspaceId: principal.workspaceId, assigneeId: { in: ids }, resolvedAt: { gte: since } },
        select: { assigneeId: true, createdAt: true, resolvedAt: true },
      }),
    ]);

    const openBy = new Map(openCounts.map((c) => [c.assigneeId, c._count]));
    const resolvedBy = new Map<string, number[]>();
    for (const t of resolvedRows) {
      const list = resolvedBy.get(t.assigneeId!) ?? [];
      list.push((t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60_000);
      resolvedBy.set(t.assigneeId!, list);
    }

    return agents.map((a) => {
      const durations = resolvedBy.get(a.id) ?? [];
      const avg = durations.length ? durations.reduce((s, v) => s + v, 0) / durations.length : null;
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        open: openBy.get(a.id) ?? 0,
        resolved: durations.length,
        avgResolution: fmtMins(avg),
        avgResolutionMins: avg,
      };
    });
  }
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private assertDays(days: string | undefined): number {
    const n = parseInt(days ?? '7', 10);
    if (!Number.isFinite(n) || n < 1 || n > 90) throw new ForbiddenException('days must be 1–90');
    return n;
  }

  @Get('summary')
  @AllowApiKey()
  @Scopes('reports:read')
  summary(@CurrentUser() principal: Principal, @Query('teamId') teamId?: string) {
    return this.reports.summary(principal, teamId);
  }

  @Get('volume')
  @AllowApiKey()
  @Scopes('reports:read')
  volume(@CurrentUser() principal: Principal, @Query('days') days?: string, @Query('teamId') teamId?: string) {
    return this.reports.volume(principal, this.assertDays(days), teamId);
  }

  @Get('by-channel')
  @AllowApiKey()
  @Scopes('reports:read')
  byChannel(@CurrentUser() principal: Principal, @Query('days') days?: string, @Query('teamId') teamId?: string) {
    return this.reports.byChannel(principal, this.assertDays(days), teamId);
  }

  @Get('by-agent')
  @AllowApiKey()
  @Scopes('reports:read')
  byAgent(@CurrentUser() principal: Principal, @Query('days') days?: string, @Query('teamId') teamId?: string) {
    return this.reports.byAgent(principal, this.assertDays(days), teamId);
  }
}

@Module({
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
