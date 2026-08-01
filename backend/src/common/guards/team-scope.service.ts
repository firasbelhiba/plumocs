import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Principal } from '../decorators';

/**
 * Row-level team/assignment checks (§8.4) — the T/A cells of the matrix.
 * Implemented as an injectable service so both HTTP guards and services can
 * call it; the loaded ticket is cached on the request by the caller.
 *
 *  - agent: ticket.team_id ∈ user.teams OR ticket.assignee_id = user.id
 *  - lead:  ticket.team_id ∈ user.teams (any assignee)
 *  - admin: everything
 *  - unrouted tickets (team_id null) are visible to leads and admins only
 */
/** An id no row can hold — used to keep a filter closed when a user has no team. */
export const NO_TEAM = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class TeamScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load a ticket AND assert the principal may act on it.
   *
   * This is the only supported way to fetch a ticket by id. It exists because
   * the two halves used to be separate calls, and `TicketsService.remove()`
   * made only the first one — so any admin could delete any ticket by id while
   * every sibling mutation checked. Fusing them makes that omission
   * unrepresentable rather than a thing reviewers have to notice.
   */
  async loadAndAssert(id: string, principal: Principal) {
    const ticket = await this.loadTicketUnchecked(id);
    this.assertCanAccess(principal, ticket);
    return ticket;
  }

  /**
   * Loads without an access check.
   *
   * Deliberately named so it cannot be reached for absent-mindedly. Only two
   * callers are legitimate: `loadAndAssert` above, and flows that must compare
   * two tickets before deciding (merge asserts on both explicitly). Everything
   * else must use `loadAndAssert`.
   */
  async loadTicketUnchecked(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  /** Throws 403 when the principal may not act on the ticket. */
  assertCanAccess(principal: Principal, ticket: { teamId: string | null; assigneeId: string | null }) {
    if (principal.kind === 'api_key') {
      // A key bound to a team is confined to it — the machine equivalent of a
      // lead's scope. An unbound key is instance-wide by deliberate grant.
      if (!principal.teamId) return;
      if (ticket.teamId === principal.teamId) return;
      throw new ForbiddenException('Outside this key’s team');
    }
    if (principal.role === 'admin') return;

    const inTeam = !!ticket.teamId && ticket.teamId === principal.teamId;
    if (principal.role === 'lead') {
      if (inTeam) return;
      throw new ForbiddenException('Outside your team');
    }
    // agent
    const assignedToMe = ticket.assigneeId === principal.id;
    if (inTeam || assignedToMe) return;
    throw new ForbiddenException('Outside your team or assignment');
  }

  /**
   * Prisma `where` fragment limiting a ticket list to what the principal may see.
   *
   * NOTE the sentinel: a bare `{ teamId: undefined }` is stripped by Prisma and
   * degrades to "match everything", so a team-less lead would see the whole
   * instance. Matching an impossible id keeps the filter closed instead.
   */
  visibilityWhere(principal: Principal): Record<string, unknown> {
    if (principal.kind === 'api_key') {
      // Bound key → confined to its team. Unbound → instance-wide, which is a
      // deliberate grant (see ApiKeysService.create) rather than an accident.
      return principal.teamId ? { teamId: principal.teamId } : {};
    }
    if (principal.role === 'admin') return {};
    const teamId = principal.teamId ?? NO_TEAM;
    if (principal.role === 'lead') {
      return { teamId };
    }
    return {
      OR: [{ teamId }, { assigneeId: principal.id }],
    };
  }

  /**
   * The same rule as `visibilityWhere`, expressed as a SQL predicate for the
   * places that must aggregate in the database rather than in Node.
   *
   * Deliberately kept next to its Prisma twin: two encodings of one access rule
   * are a drift hazard, so they live together and are asserted equivalent in
   * team-scope.integration.spec.ts.
   */
  visibilitySql(principal: Principal): Prisma.Sql {
    if (principal.kind === 'api_key') {
      return principal.teamId
        ? Prisma.sql`team_id = ${principal.teamId}::uuid`
        : Prisma.sql`TRUE`;
    }
    if (principal.role === 'admin') return Prisma.sql`TRUE`;
    const teamId = principal.teamId ?? NO_TEAM;
    if (principal.role === 'lead') return Prisma.sql`team_id = ${teamId}::uuid`;
    return Prisma.sql`(team_id = ${teamId}::uuid OR assignee_id = ${principal.id}::uuid)`;
  }
}
