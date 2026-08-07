import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueProducer } from '../queue/queue.producer';
import { SlaService } from '../sla/sla.service';
import { CustomersService } from '../customers/customers.module';
import { TeamScopeService } from '../common/guards/team-scope.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Principal } from '../common/decorators';
import { assertTransition, isReopen } from './ticket-state-machine';
import { AssignDto, BulkDto, CreateTicketDto, ListTicketsDto, PatchTicketDto } from './dto/tickets.dto';

/**
 * Who is answering a conversation right now.
 *
 *   ai         a chatbot opened it and still owns it
 *   escalated  the bot gave up; a human is needed but none has taken it
 *   assigned   a human owns it
 *   human      opened by a person, unassigned (the console's own tickets)
 *   closed     resolved or closed, by whoever
 *
 * DERIVED, not stored, and deliberately not a `ticket_status` value. Adding
 * `ai_handling` / `needs_human` to that enum would mean defining every legal
 * transition to and from them in the state machine, and the enum's DECLARATION
 * ORDER is load-bearing — it is what the inbox sorts by — so inserting members
 * reorders every existing desk's queue. Status answers "where is this in the
 * lifecycle"; handling answers "who is holding it". They are different
 * questions and conflating them makes both harder to change.
 *
 * Derived also cannot drift: handedOffAt IS the fact. A stored duplicate is one
 * missed write away from claiming a bot owns a conversation a human is on.
 */
export type TicketHandling = 'ai' | 'escalated' | 'assigned' | 'human' | 'closed';

export function handlingOf(t: {
  status: TicketStatus;
  createdByApiKeyId?: string | null;
  handedOffAt?: Date | null;
  assigneeId?: string | null;
}): TicketHandling {
  if (t.status === 'resolved' || t.status === 'closed') return 'closed';
  if (!t.createdByApiKeyId) return t.assigneeId ? 'assigned' : 'human';
  if (!t.handedOffAt) return 'ai';
  return t.assigneeId ? 'assigned' : 'escalated';
}

/**
 * A function of the workspace now, not a constant.
 *
 * `role` and `availability` are properties of a membership, and Prisma cannot
 * correlate a nested filter against the parent row's workspace_id — so the
 * workspace has to be supplied by the caller. Every call site already knows it
 * from the Principal.
 */
const ticketInclude = (workspaceId: string) =>
  ({
    customer: { include: { organization: true } },
    assignee: {
      select: {
        id: true,
        name: true,
        memberships: {
          where: { workspaceId },
          select: { role: true, availability: true },
          take: 1,
        },
      },
    },
    team: { select: { id: true, name: true } },
    slaPolicy: { select: { id: true, name: true } },
  }) satisfies Prisma.TicketInclude;

/**
 * Options for in-process callers of `create()`.
 *
 * These exist so chatbot ingest goes through the SAME creation path as the
 * console instead of issuing its own `prisma.ticket.create`. The inbound-email
 * job already does that and silently skips SLA, routing and assignment as a
 * result; a third such path would be the same bug a third time.
 */
export interface CreateTicketOptions {
  /** The chatbot that filed this, recorded on the ticket. */
  createdByApiKeyId?: string;
  /**
   * A bot is answering, so no human is accountable yet: skip round-robin and
   * leave the SLA due times unset until handoff.
   *
   * Without this a bot conversation is auto-assigned to a real agent and starts
   * a first-response clock that only a human message can stop — and a bot's
   * message cannot, because first_responded_at is stamped only for `user`
   * actors. Every bot ticket would sit in `new`, breach, and page that agent.
   */
  botHandled?: boolean;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueProducer,
    private readonly sla: SlaService,
    private readonly customers: CustomersService,
    private readonly scope: TeamScopeService,
    private readonly realtime: RealtimeService,
  ) {}

  // ---- create ---------------------------------------------------------------

  /**
   * Internal knobs for callers inside the process. Not reachable over HTTP —
   * the DTO is whitelisted, so nothing here can be set by a request body.
   */
  async create(dto: CreateTicketDto, actor: Principal, opts: CreateTicketOptions = {}) {
    // find-or-create the customer by email (§9 "on create")
    const customer = dto.customerId
      ? await this.prisma.customer.findUniqueOrThrow({ where: { id: dto.customerId } }).catch(() => {
          throw new NotFoundException('Customer not found');
        })
      : await this.customers.findOrCreateByEmail(dto.customerEmail!, dto.customerName);

    const priority = dto.priority ?? 'normal';
    const channel = dto.channel ?? (actor.kind === 'api_key' ? 'api' : 'manual');
    const now = new Date();
    // The human SLA clock starts at handoff, not at creation — see botHandled.
    const due = opts.botHandled
      ? { policyId: null, firstResponseDueAt: null, resolutionDueAt: null }
      : await this.sla.computeDueTimes(priority, now);

    const { teamId, assigneeId } = await this.resolveRouting(dto, actor, opts);

    const ticket = await this.prisma.ticket.create({
      data: {
        subject: dto.subject,
        priority,
        channel,
        customerId: customer.id,
        organizationId: customer.organizationId,
        teamId,
        assigneeId,
        slaPolicyId: due.policyId,
        firstResponseDueAt: due.firstResponseDueAt,
        resolutionDueAt: due.resolutionDueAt,
        tags: dto.tags ?? [],
        sourceRef: dto.sourceRef ?? null,
        createdByApiKeyId: opts.createdByApiKeyId ?? null,
        ...(dto.body
          ? {
              messages: {
                create: {
                  authorType: 'customer',
                  authorId: customer.id,
                  body: dto.body,
                  channel,
                },
              },
            }
          : {}),
      },
      include: ticketInclude(actor.workspaceId),
    });

    await this.audit.write({ actor, entityType: 'ticket', entityId: ticket.id, action: 'create' });
    // enqueue side effects; the transaction has committed
    this.queue.deliverWebhooks('ticket.created', this.webhookPayload(ticket));
    this.queue.indexTicket(ticket.id);
    if (assigneeId) {
      this.queue.notify({
        kind: 'assignment',
        userIds: [assigneeId],
        text: `#${ticket.number} was assigned to you`,
        ticketId: ticket.id,
      });
    }
    this.realtime.publish('ticket.created', {
      workspaceId: actor.workspaceId,
      id: ticket.id,
      number: Number(ticket.number),
      teamId: ticket.teamId,
      assigneeId: ticket.assigneeId,
    });
    return this.serialize(ticket);
  }

  /**
   * Decides which team owns a new ticket and who holds it, refusing the
   * combinations this caller may not create.
   *
   * This used to be inline and got it wrong three ways at once. An API key's own
   * team was dropped on the floor — the branch read
   * `actor.kind === 'user' ? actor.teamId : null`, so every machine caller fell
   * through to the instance default team. `dto.teamId` was then taken verbatim
   * from that same machine caller. And only agents were checked, so a lead could
   * create straight into a team that `patch()` would have refused to move a
   * ticket into. Together that meant a chatbot key bound to one team could file
   * tickets into another team entirely, and then not be able to read them back.
   *
   * The rules match `patch()` exactly, because a principal that cannot move a
   * ticket somewhere has no business creating one there either.
   */
  private async resolveRouting(
    dto: CreateTicketDto,
    actor: Principal,
    opts: CreateTicketOptions = {},
  ): Promise<{ teamId: string | null; assigneeId: string | null }> {
    let teamId: string | null;

    if (actor.kind === 'api_key') {
      // A bound key is confined to its team on write exactly as visibilityWhere
      // confines it on read. Without this it can create what it cannot fetch.
      if (actor.teamId) {
        if (dto.teamId && dto.teamId !== actor.teamId) {
          throw new ForbiddenException('Outside this key’s team');
        }
        teamId = actor.teamId;
      } else {
        // unbound keys are instance-wide by deliberate grant (ApiKeysService.create)
        teamId = dto.teamId ?? null;
      }
    } else if (actor.role === 'agent') {
      if (dto.teamId && dto.teamId !== actor.teamId) {
        throw new ForbiddenException('Agents can only create tickets in their own team');
      }
      teamId = actor.teamId ?? null;
    } else if (actor.role === 'lead') {
      // a lead's reach is their own team, the same rule patch() applies to moves
      if (dto.teamId && dto.teamId !== actor.teamId) {
        throw new ForbiddenException('Leads can only create tickets in their own team');
      }
      teamId = actor.teamId ?? null;
    } else {
      teamId = dto.teamId ?? actor.teamId ?? null;
    }

    teamId = teamId ?? (await this.defaultTeamId());

    if (dto.assigneeId) {
      // one authority for "who may hold this ticket", shared with patch()
      await this.assertCanAssign(actor, { teamId, assigneeId: null }, dto.assigneeId);
    }
    // A bot-handled conversation is deliberately unassigned: handing it to an
    // agent who is not looking at it is what turns the unassigned queue into
    // noise and makes the SLA sweep page somebody for a bot's silence.
    const assigneeId =
      dto.assigneeId ??
      (opts.botHandled || !teamId ? null : await this.roundRobinAssignee(teamId, actor.workspaceId));

    // Final invariant: nobody may create a ticket they could not then read.
    // Cheap here, and it catches whatever the next edit to this method gets wrong.
    this.scope.assertCanAccess(actor, { teamId, assigneeId });

    return { teamId, assigneeId };
  }

  /**
   * Turn the chatbot back on for a conversation, or off.
   *
   * Off is normally automatic — replying to a chat ticket disables the bot so it
   * cannot talk over you. This exists for the way back: an agent who has dealt
   * with the hard part and is happy for the assistant to take follow-ups.
   */
  async setBotEnabled(id: string, enabled: boolean, actor: Principal) {
    const ticket = await this.scope.loadAndAssert(id, actor);
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { botEnabled: enabled },
    });
    await this.audit.write({
      actor, entityType: 'ticket', entityId: id,
      action: enabled ? 'bot.enabled' : 'bot.disabled',
    });
    this.realtime.publish('ticket.updated', {
      workspaceId: actor.workspaceId,
      id, number: Number(updated.number), teamId: updated.teamId, assigneeId: updated.assigneeId,
    });
    return this.serialize(updated);
  }

  private async defaultTeamId(): Promise<string | null> {
    const team = await this.prisma.team.findFirst({ orderBy: { createdAt: 'asc' } });
    return team?.id ?? null;
  }

  /** Round-robin = the available, active agent in the team with the fewest open tickets. */
  private async roundRobinAssignee(teamId: string, workspaceId: string): Promise<string | null> {
    // Membership, not user: team, availability and per-desk activation all
    // live there now. `user: { isActive: true }` stays as well — a globally
    // disabled account must not be handed work by any desk, even one whose
    // membership row still says active.
    const members = await this.prisma.workspaceMembership.findMany({
      where: { workspaceId, teamId, isActive: true, availability: 'available', user: { isActive: true } },
      select: { userId: true },
    });
    const agents = members.map((m) => ({ id: m.userId }));
    if (agents.length === 0) return null;
    const counts = await this.prisma.ticket.groupBy({
      by: ['assigneeId'],
      where: { assigneeId: { in: agents.map((a) => a.id) }, status: { notIn: ['resolved', 'closed'] } },
      _count: true,
    });
    const load = new Map(counts.map((c) => [c.assigneeId, c._count]));
    agents.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
    return agents[0].id;
  }

  // ---- list / get -----------------------------------------------------------

  async list(dto: ListTicketsDto, actor: Principal) {
    const where: Prisma.TicketWhereInput = { AND: [this.scope.visibilityWhere(actor) as Prisma.TicketWhereInput] };
    const and = where.AND as Prisma.TicketWhereInput[];

    const openStatuses: TicketStatus[] = ['new', 'open', 'pending', 'on_hold'];
    switch (dto.view) {
      case 'all-open':
        and.push({ status: { in: openStatuses } });
        break;
      case 'unassigned':
        // `no one yet` is the queue agents PULL from, so it must only hold work
        // waiting on a human. A conversation the bot still owns is not waiting
        // on anyone — it is deliberately unassigned — and listing it here makes
        // the one view agents rely on mostly noise. Escalated bot conversations
        // DO belong: handedOffAt is set, so they pass this filter.
        and.push({
          status: { in: openStatuses },
          assigneeId: null,
          NOT: { createdByApiKeyId: { not: null }, handedOffAt: null },
        });
        break;
      case 'my-open':
        and.push({ status: { in: openStatuses }, assigneeId: actor.id });
        break;
      case 'breaching':
        and.push({
          status: { in: openStatuses },
          slaPausedAt: null,
          firstRespondedAt: null,
          firstResponseDueAt: { lt: new Date(Date.now() + 30 * 60_000) },
        });
        break;
      case 'pending':
        and.push({ status: { in: ['pending', 'on_hold'] } });
        break;
      case 'resolved':
        and.push({ status: { in: ['resolved', 'closed'] } });
        break;
      case 'bot-handled':
        // Conversations the AI owns, or owned from start to finish.
        //
        // handedOffAt IS NULL is the whole definition. Once a human takes over —
        // by handing off, or simply by replying — the conversation stops being
        // the AI's and belongs in the human queues instead. Leaving it here too
        // would double-count it and make the label untrue: an escalated ticket
        // is precisely one the AI could NOT handle.
        //
        // Bot-RESOLVED conversations do stay, because the AI handled those to
        // completion. They are absent from `all-open` (resolved) and from
        // `unassigned` (nobody should be paged for finished work), so without
        // this view the AI's output would be invisible.
        //
        // For "everything the bot ever touched", including escalations, filter
        // by channel = chatbot instead.
        and.push({ createdByApiKeyId: { not: null }, handedOffAt: null });
        break;
      case 'bot-open':
        // Still with the bot: it opened the conversation, nobody has handed it
        // off, and it is not finished. The set worth watching for a bot that
        // has quietly stopped answering.
        and.push({ createdByApiKeyId: { not: null }, handedOffAt: null, status: { in: ['new', 'open'] } });
        break;
    }

    if (dto.status) and.push({ status: { in: dto.status.split(',') as TicketStatus[] } });
    if (dto.priority) and.push({ priority: { in: dto.priority.split(',') as never } });
    if (dto.channel) and.push({ channel: { in: dto.channel.split(',') as never } });
    if (dto.tag) and.push({ tags: { has: dto.tag } });
    if (dto.teamId) and.push({ teamId: dto.teamId });
    if (dto.assigneeId === '@unassigned') and.push({ assigneeId: null });
    else if (dto.assigneeId) and.push({ assigneeId: dto.assigneeId });
    if (dto.range && dto.range !== 'any') {
      const since =
        dto.range === 'today'
          ? new Date(new Date().setHours(0, 0, 0, 0))
          : new Date(Date.now() - (dto.range === '7d' ? 7 : 30) * 86_400_000);
      and.push({ updatedAt: { gte: since } });
    }
    if (dto.q) {
      const asNumber = parseInt(dto.q.replace(/^#/, ''), 10);
      and.push({
        OR: [
          { subject: { contains: dto.q, mode: 'insensitive' } },
          ...(Number.isFinite(asNumber) ? [{ number: BigInt(asNumber) }] : []),
          { customer: { name: { contains: dto.q, mode: 'insensitive' } } },
        ],
      });
    }

    // id tiebreaker keeps the order stable so cursor pages never skip or repeat
    const orderBy: Prisma.TicketOrderByWithRelationInput[] =
      dto.sort === 'created'
        ? [{ createdAt: 'desc' }, { id: 'desc' }]
        : dto.sort === 'priority'
          ? [{ priority: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }]
          : dto.sort === 'sla'
            ? [{ firstResponseDueAt: 'asc' }, { id: 'asc' }]
            : [{ updatedAt: 'desc' }, { id: 'desc' }];

    const offset = dto.offset ?? 0;
    const limit = dto.limit ?? 25;
    const useCursor = !!dto.cursor;
    const [rows, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          ...ticketInclude(actor.workspaceId),
          // the latest message powers the row snippet in the console;
          // machines never see internal notes (mirrors get())
          messages: {
            where: actor.kind === 'api_key' ? { isInternalNote: false } : {},
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { body: true, isInternalNote: true, authorType: true },
          },
        },
        orderBy,
        take: limit + 1, // one extra row to know whether a next page exists
        ...(useCursor
          ? { cursor: { id: dto.cursor }, skip: 1 } // skip the cursor row itself
          : { skip: offset }),
      }),
      this.prisma.ticket.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: pageRows.map((t) => this.serialize(t)),
      page: {
        ...(useCursor ? {} : { offset }),
        limit,
        total,
        nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
      },
    };
  }

  /**
   * View-tab counts + filter-rail facets in one visibility-scoped call —
   * what the console's inbox chrome renders around the list.
   */
  async counts(actor: Principal) {
    const visibility = this.scope.visibilityWhere(actor) as Prisma.TicketWhereInput;
    const openStatuses: TicketStatus[] = ['new', 'open', 'pending', 'on_hold'];
    const openWhere: Prisma.TicketWhereInput = { AND: [visibility, { status: { in: openStatuses } }] };

    const [allOpen, unassigned, myOpen, breaching, pending, resolved, botHandled, botOpen, byStatus, byPriority, byChannel, tagRows] =
      await Promise.all([
        this.prisma.ticket.count({ where: openWhere }),
        // mirrors the 'unassigned' view exactly — see the comment there
        this.prisma.ticket.count({
          where: {
            AND: [openWhere, { assigneeId: null, NOT: { createdByApiKeyId: { not: null }, handedOffAt: null } }],
          },
        }),
        this.prisma.ticket.count({ where: { AND: [openWhere, { assigneeId: actor.id }] } }),
        this.prisma.ticket.count({
          where: {
            AND: [
              openWhere,
              { slaPausedAt: null, firstRespondedAt: null, firstResponseDueAt: { lt: new Date(Date.now() + 30 * 60_000) } },
            ],
          },
        }),
        this.prisma.ticket.count({ where: { AND: [visibility, { status: { in: ['pending', 'on_hold'] } }] } }),
        this.prisma.ticket.count({ where: { AND: [visibility, { status: { in: ['resolved', 'closed'] } }] } }),
        // must mirror the 'bot-handled' view above exactly — a badge that counts
        // something different from what the tab shows is worse than no badge
        this.prisma.ticket.count({
          where: { AND: [visibility, { createdByApiKeyId: { not: null }, handedOffAt: null }] },
        }),
        // still with the bot: never handed off and not finished
        this.prisma.ticket.count({
          where: {
            AND: [visibility, { createdByApiKeyId: { not: null }, handedOffAt: null, status: { in: ['new', 'open'] } }],
          },
        }),
        this.prisma.ticket.groupBy({ by: ['status'], where: visibility, _count: true }),
        this.prisma.ticket.groupBy({ by: ['priority'], where: visibility, _count: true }),
        this.prisma.ticket.groupBy({ by: ['channel'], where: visibility, _count: true }),
        // Aggregated in Postgres, not in Node. This used to pull {tags:true}
        // for every visible ticket back to the app and count in JS on each
        // inbox render — O(visible tickets) per keystroke of the filter rail.
        this.prisma.$queryRaw<Array<{ tag: string; n: bigint }>>(
          Prisma.sql`SELECT unnest(tags) AS tag, count(*) AS n
                     FROM tickets
                     WHERE ${this.scope.visibilitySql(actor)}
                     GROUP BY 1`,
        ),
      ]);

    const tagCounts: Record<string, number> = {};
    for (const row of tagRows) {
      if (row.tag.startsWith('sla:')) continue; // sweep markers, not user tags
      tagCounts[row.tag] = Number(row.n);
    }

    return {
      views: {
        'all-open': allOpen,
        unassigned,
        'my-open': myOpen,
        breaching,
        pending,
        resolved,
        'bot-handled': botHandled,
        'bot-open': botOpen,
      },
      facets: {
        status: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
        priority: Object.fromEntries(byPriority.map((r) => [r.priority, r._count])),
        channel: Object.fromEntries(byChannel.map((r) => [r.channel, r._count])),
        tag: tagCounts,
      },
    };
  }

  /** Ticket + thread + rail data. */
  async get(id: string, actor: Principal) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        ...ticketInclude(actor.workspaceId),
        messages: { orderBy: { createdAt: 'asc' }, include: { attachments: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    this.scope.assertCanAccess(actor, ticket);

    // machine keys with only tickets:read shouldn't see internal notes
    const messages =
      actor.kind === 'api_key'
        ? ticket.messages.filter((m) => !m.isInternalNote)
        : ticket.messages;

    return { ...this.serialize(ticket), messages };
  }

  // ---- mutations --------------------------------------------------------------

  async patch(id: string, dto: PatchTicketDto, actor: Principal) {
    const ticket = await this.scope.loadAndAssert(id, actor);

    const data: Prisma.TicketUpdateInput = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};

    if (dto.subject !== undefined && dto.subject !== ticket.subject) {
      data.subject = dto.subject;
      diff.subject = { from: ticket.subject, to: dto.subject };
    }
    if (dto.priority !== undefined && dto.priority !== ticket.priority) {
      data.priority = dto.priority;
      diff.priority = { from: ticket.priority, to: dto.priority };
    }
    if (dto.tags !== undefined) {
      // `sla:*` markers are the sweep's "already announced" record and are
      // hidden from clients — preserve them across a client-supplied tag list,
      // or every retag would re-trigger breach notifications.
      const markers = ticket.tags.filter((t) => t.startsWith('sla:'));
      const next = Array.from(new Set([...dto.tags.filter((t) => !t.startsWith('sla:')), ...markers]));
      data.tags = next;
      diff.tags = { from: ticket.tags, to: next };
    }
    if (dto.outcome !== undefined) {
      data.outcome = dto.outcome;
      diff.outcome = { from: ticket.outcome, to: dto.outcome };
    }
    if (dto.assigneeId !== undefined) {
      await this.assertCanAssign(actor, ticket, dto.assigneeId);
      data.assignee = dto.assigneeId ? { connect: { id: dto.assigneeId } } : { disconnect: true };
      diff.assigneeId = { from: ticket.assigneeId, to: dto.assigneeId };
    }
    if (dto.teamId !== undefined) {
      if (actor.kind === 'user' && actor.role === 'agent') {
        throw new ForbiddenException('Agents cannot move tickets between teams');
      }
      // a lead's reach is their own team on BOTH sides of the move
      if (actor.kind === 'user' && actor.role === 'lead' && dto.teamId && dto.teamId !== actor.teamId) {
        throw new ForbiddenException('Leads can only move tickets into their own team');
      }
      data.team = dto.teamId ? { connect: { id: dto.teamId } } : { disconnect: true };
      diff.teamId = { from: ticket.teamId, to: dto.teamId };
    }
    if (dto.status !== undefined && dto.status !== ticket.status) {
      await this.applyTransition(ticket, dto.status, actor, data, diff);
    }

    if (Object.keys(data).length === 0) return this.get(id, actor);

    const updated = await this.prisma.ticket.update({ where: { id }, data, include: ticketInclude(actor.workspaceId) });
    await this.audit.write({ actor, entityType: 'ticket', entityId: id, action: 'update', diff });

    this.queue.deliverWebhooks(
      dto.status === 'resolved' ? 'ticket.resolved' : 'ticket.updated',
      this.webhookPayload(updated),
    );
    if (diff.assigneeId?.to) {
      this.queue.deliverWebhooks('ticket.assigned', this.webhookPayload(updated));
      this.queue.notify({
        kind: 'assignment',
        userIds: [diff.assigneeId.to as string],
        text: `#${updated.number} was assigned to you`,
        ticketId: id,
      });
    }
    if (dto.subject !== undefined) this.queue.indexTicket(id);
    this.realtimeUpdate(updated, actor.workspaceId);
    return this.serialize(updated);
  }

  async assign(id: string, dto: AssignDto, actor: Principal) {
    // Distinguish "not supplied" from "explicitly null": a team-only move must
    // not silently unassign whoever is holding the ticket.
    const patch: PatchTicketDto = {};
    if ('assigneeId' in dto) {
      patch.assigneeId = dto.assigneeId === 'me' ? actor.id : dto.assigneeId ?? null;
    }
    if (dto.teamId) patch.teamId = dto.teamId;
    return this.patch(id, patch, actor);
  }

  async transition(id: string, to: TicketStatus, actor: Principal) {
    return this.patch(id, { status: to }, actor);
  }

  private async applyTransition(
    ticket: { status: TicketStatus; slaPausedAt: Date | null; firstResponseDueAt: Date | null; resolutionDueAt: Date | null; slaPolicyId: string | null },
    to: TicketStatus,
    actor: Principal,
    data: Prisma.TicketUpdateInput,
    diff: Record<string, { from: unknown; to: unknown }>,
  ) {
    assertTransition(ticket.status, to);
    if (isReopen(ticket.status, to) && actor.kind === 'user' && actor.role === 'agent') {
      throw new ForbiddenException('Reopening a closed conversation needs a lead');
    }
    data.status = to;
    diff.status = { from: ticket.status, to };
    // resume must add business time, not wall-clock — needs the policy calendar
    const calendar = ticket.slaPausedAt ? await this.sla.calendarForTicket(ticket.slaPolicyId) : null;
    const timers = this.sla.timerPatchForTransition(ticket, to, new Date(), calendar);
    Object.assign(data, timers);
    if (isReopen(ticket.status, to)) {
      data.resolvedAt = null;
      data.closedAt = null;
    }
  }

  private async assertCanAssign(actor: Principal, ticket: { assigneeId: string | null; teamId: string | null }, newAssignee: string | null) {
    if (actor.kind === 'api_key') {
      // A bound key handing work to somebody outside its team would put the
      // ticket in that person's inbox — agents see anything assigned to them,
      // team or not — which is a leak the key's read scope would never allow.
      if (!actor.teamId || !newAssignee) return;
      // The membership carries the team and the per-desk activation. Checking
      // the user row instead would compare a column that no longer exists and,
      // once there are two workspaces, would have compared the wrong desk's.
      const target = await this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: newAssignee } },
        select: { teamId: true, isActive: true, user: { select: { isActive: true } } },
      });
      if (!target || !target.isActive || !target.user.isActive) {
        throw new UnprocessableEntityException('That person is not available');
      }
      if (target.teamId !== actor.teamId) {
        throw new ForbiddenException('Outside this key’s team');
      }
      return;
    }
    if (actor.role === 'agent') {
      // agents may only self-assign from their own team's pool
      const selfAssign = newAssignee === actor.id;
      const inTeam = !!ticket.teamId && ticket.teamId === actor.teamId;
      if (!selfAssign || !inTeam) {
        throw new ForbiddenException('Agents can only assign themselves within their team');
      }
      return;
    }
    if (actor.role === 'lead' && newAssignee && newAssignee !== actor.id) {
      // a lead hands work to their own people, not another team's
      // The membership carries the team and the per-desk activation. Checking
      // the user row instead would compare a column that no longer exists and,
      // once there are two workspaces, would have compared the wrong desk's.
      const target = await this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: newAssignee } },
        select: { teamId: true, isActive: true, user: { select: { isActive: true } } },
      });
      if (!target || !target.isActive || !target.user.isActive) {
        throw new UnprocessableEntityException('That person is not available');
      }
      if (target.teamId !== actor.teamId) {
        throw new ForbiddenException('Leads can only assign people in their own team');
      }
    }
  }

  // ---- bulk -------------------------------------------------------------------

  async bulk(dto: BulkDto, actor: Principal) {
    if (actor.kind === 'user' && actor.role === 'agent') {
      throw new ForbiddenException('Bulk actions need a lead');
    }
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of dto.ids) {
      try {
        switch (dto.action) {
          case 'assign':
            await this.assign(id, { assigneeId: dto.assigneeId ?? 'me' }, actor);
            break;
          case 'status':
            if (!dto.status) throw new UnprocessableEntityException('status is required');
            await this.transition(id, dto.status as TicketStatus, actor);
            break;
          case 'tag': {
            if (!dto.tag) throw new UnprocessableEntityException('tag is required');
            const t = await this.scope.loadAndAssert(id, actor);
            await this.patch(id, { tags: Array.from(new Set([...t.tags, dto.tag])) }, actor);
            break;
          }
          case 'close':
            await this.transition(id, 'closed', actor);
            break;
        }
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: (err as Error).message });
      }
    }
    return { results };
  }

  // ---- merge (lead+, per the matrix) --------------------------------------------

  /**
   * Merge a ticket into another: its thread moves to the target (a system
   * event marks the seam), and the source closes. Both tickets must be
   * within the actor's scope.
   */
  async merge(sourceId: string, targetId: string, actor: Principal) {
    if (actor.kind === 'user' && actor.role === 'agent') {
      throw new ForbiddenException('Merging needs a lead');
    }
    if (sourceId === targetId) {
      throw new UnprocessableEntityException('A conversation cannot be merged into itself');
    }
    // merge compares two tickets before acting, so both are loaded first and
    // asserted explicitly below — the one legitimate use of the unchecked load
    const [source, target] = await Promise.all([
      this.scope.loadTicketUnchecked(sourceId),
      this.scope.loadTicketUnchecked(targetId),
    ]);
    this.scope.assertCanAccess(actor, source);
    this.scope.assertCanAccess(actor, target);
    if (['resolved', 'closed'].includes(target.status)) {
      throw new UnprocessableEntityException('Cannot merge into a closed conversation');
    }

    await this.prisma.$transaction([
      this.prisma.ticketMessage.updateMany({
        where: { ticketId: sourceId },
        data: { ticketId: targetId },
      }),
      this.prisma.ticketMessage.create({
        data: {
          ticketId: targetId,
          authorType: 'system',
          body: `merged from conversation #${source.number} — "${source.subject}"`,
          isInternalNote: true,
          channel: source.channel,
        },
      }),
      this.prisma.ticket.update({
        where: { id: sourceId },
        data: { status: 'closed', closedAt: new Date(), sourceRef: `merged→#${target.number}` },
      }),
      this.prisma.ticket.update({ where: { id: targetId }, data: { updatedAt: new Date() } }),
    ]);

    await this.audit.write({
      actor, entityType: 'ticket', entityId: sourceId, action: 'merge',
      diff: { into: targetId, targetNumber: Number(target.number) },
    });
    this.queue.indexTicket(targetId);
    this.queue.deliverWebhooks('ticket.updated', this.webhookPayload({ ...target, updatedAt: new Date() } as never));
    this.realtimeUpdate(target, actor.workspaceId);
    this.realtimeUpdate(source, actor.workspaceId);
    return { ok: true, mergedInto: targetId };
  }

  // ---- delete (admin-only, audited) --------------------------------------------

  async remove(id: string, actor: Principal) {
    const ticket = await this.scope.loadAndAssert(id, actor);
    await this.prisma.ticket.delete({ where: { id } });
    await this.audit.write({
      actor, entityType: 'ticket', entityId: id, action: 'delete',
      diff: { number: Number(ticket.number), subject: ticket.subject },
    });
    return { ok: true };
  }

  async auditTrail(id: string, actor: Principal) {
    await this.scope.loadAndAssert(id, actor);
    return this.audit.forEntity('ticket', id);
  }

  // ---- helpers ------------------------------------------------------------------

  /**
   * Realtime payloads carry team/assignee so the gateway can scope delivery,
   * and the workspace so it can scope it to a tenant. The gateway drops an
   * event that names no workspace, so this is not decoration — omit it and the
   * console simply stops updating.
   */
  private realtimeUpdate(
    ticket: { id: string; number: bigint; teamId: string | null; assigneeId: string | null },
    workspaceId: string,
  ) {
    this.realtime.publish('ticket.updated', {
      workspaceId,
      id: ticket.id,
      number: Number(ticket.number),
      teamId: ticket.teamId,
      assigneeId: ticket.assigneeId,
    });
  }

  private webhookPayload(t: Record<string, unknown> & { number: bigint }) {
    return {
      id: t.id,
      number: Number(t.number),
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      channel: t.channel,
      assigneeId: t.assigneeId ?? null,
      teamId: t.teamId ?? null,
      tags: t.tags,
      updatedAt: t.updatedAt,
    } as Record<string, unknown>;
  }

  /** BigInt-safe response shape. */
  private serialize<T extends { number: bigint }>(t: T) {
    return { ...t, number: Number(t.number), handling: handlingOf(t as never) };
  }
}
