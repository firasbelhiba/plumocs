import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueProducer } from '../queue/queue.producer';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { CustomersModule, CustomersService } from '../customers/customers.module';
import { SlaService } from '../sla/sla.service';
import { SlaModule } from '../sla/sla.module';
import { handlingOf, TicketsService } from '../tickets/tickets.service';
import { TicketsModule } from '../tickets/tickets.module';
import { AllowApiKey, CurrentUser, Principal, Scopes } from '../common/decorators';

/**
 * Chatbot ingest — the surface a third-party chatbot integrates against.
 *
 * Deliberately separate from /tickets rather than an extension of it. The
 * console's ticket routes exist to serve a UI and change shape whenever that UI
 * does; this one is a partner contract, and once a partner is live in production
 * its request and response shapes cannot change without breaking them. Keeping
 * them apart means the console stays free to evolve.
 *
 * SERVER-TO-SERVER ONLY. The credential is an API key, and an API key placed in
 * browser JavaScript is public — anyone reading the page source could file and
 * read tickets for the whole desk. There is no CORS allowance here on purpose;
 * a browser widget must talk to its own backend, which then talks to this.
 *
 * TICKET NUMBERS ARE NEVER RETURNED. Partners get the ticket UUID, which is
 * stable forever. Numbers are about to become per-workspace, and any partner
 * that had learned a number would see it change.
 *
 * IDEMPOTENCY IS STRUCTURAL, not a separate ledger. Opening a conversation
 * upserts on (apiKeyId, sessionRef); appending a turn upserts on
 * (ticketId, externalRef). A partner that retries after a timeout gets the same
 * ticket and the same message back instead of a duplicate.
 */

const MAX_BODY = 16_000;

class OpenConversationDto {
  /** The partner's own id for this conversation. The idempotency key. */
  @IsString() @Length(1, 200) sessionRef!: string;

  /** The partner's own id for the person, if it has one. */
  @IsOptional() @IsString() @Length(1, 200) visitorRef?: string;
  @IsOptional() @IsString() @Length(1, 200) visitorName?: string;
  @IsOptional() @IsEmail() visitorEmail?: string;

  @IsOptional() @IsString() @Length(1, 300) subject?: string;
  @IsOptional() @IsString() @Length(1, MAX_BODY) message?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

class AppendMessageDto {
  @IsString() @Length(1, MAX_BODY) body!: string;
  /** 'visitor' = the human typing, 'bot' = the chatbot answering. */
  @IsIn(['visitor', 'bot']) author!: 'visitor' | 'bot';
  /** The partner's own id for this turn. Makes the append idempotent. */
  @IsOptional() @IsString() @Length(1, 200) externalRef?: string;
}

class HandoffDto {
  @IsOptional() @IsString() @Length(1, 2000) reason?: string;
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: 'low' | 'normal' | 'high' | 'urgent';
}

class ResolveDto {
  @IsOptional() @IsIn(['answered', 'out_of_scope']) outcome?: 'answered' | 'out_of_scope';
}

class UpdatesDto {
  /** ISO timestamp cursor; returns agent activity strictly after it. */
  @IsOptional() @IsString() since?: string;
  // @Type is not optional here: the global ValidationPipe runs with
  // enableImplicitConversion disabled, so a query string arrives as "5" and
  // @IsInt rejects it — reporting the @Max message, which reads as
  // "limit must not be greater than 200" for a limit of 5.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly sla: SlaService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
    private readonly queue: QueueProducer,
    private readonly realtime: RealtimeService,
  ) {}

  /** Every route here is a chatbot, and a chatbot is exactly one API key. */
  private keyOf(actor: Principal): string {
    if (actor.kind !== 'api_key') {
      throw new ForbiddenException('The chat API is for chatbots, not console users');
    }
    return actor.id;
  }

  /**
   * Opens a conversation, or returns the existing one for this session ref.
   *
   * The uniqueness of (apiKeyId, sessionRef) is what makes this idempotent, and
   * it is keyed on the chatbot rather than the workspace because a key belongs
   * to exactly one workspace — so the constraint is strictly narrower than the
   * per-workspace one tenancy will want, and survives that migration untouched.
   */
  async openConversation(dto: OpenConversationDto, actor: Principal) {
    const apiKeyId = this.keyOf(actor);

    const existing = await this.prisma.chatSession.findUnique({
      where: { apiKeyId_sessionRef: { apiKeyId, sessionRef: dto.sessionRef } },
      include: { ticket: { select: { id: true, status: true, handedOffAt: true, assigneeId: true, createdByApiKeyId: true } } },
    });
    if (existing) return this.sessionView(existing.ticket, dto.sessionRef, false);

    // A visitor with no email is identified by (chatbot, visitorRef). If the
    // partner supplies neither we mint a reference from the session, so the row
    // still satisfies customers_identity_check and stays findable.
    const visitorRef = dto.visitorRef ?? `session:${dto.sessionRef}`;
    const customer = dto.visitorEmail
      ? await this.customers.findOrCreateByEmail(dto.visitorEmail, dto.visitorName)
      : await this.customers.findOrCreateVisitor(apiKeyId, visitorRef, dto.visitorName);

    const ticket = await this.tickets.create(
      {
        subject: dto.subject?.trim() || this.subjectFrom(dto.message) || 'Chat conversation',
        customerId: customer.id,
        channel: 'chatbot',
        tags: dto.tags ?? [],
        body: dto.message,
      } as never,
      actor,
      { createdByApiKeyId: apiKeyId, botHandled: true },
    );

    try {
      await this.prisma.chatSession.create({
        data: { apiKeyId, sessionRef: dto.sessionRef, ticketId: ticket.id, visitorRef },
      });
    } catch (e) {
      // Two opens for one session raced. The index is the arbiter; the loser
      // adopts the winner's ticket rather than returning an error the partner
      // would only retry into the same race.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const won = await this.prisma.chatSession.findUnique({
          where: { apiKeyId_sessionRef: { apiKeyId, sessionRef: dto.sessionRef } },
          include: { ticket: { select: { id: true, status: true, handedOffAt: true, assigneeId: true, createdByApiKeyId: true } } },
        });
        if (won) {
          await this.prisma.ticket.delete({ where: { id: ticket.id } }).catch(() => undefined);
          return this.sessionView(won.ticket, dto.sessionRef, false);
        }
      }
      throw e;
    }

    return this.sessionView(
      { id: ticket.id, status: ticket.status as string, handedOffAt: null },
      dto.sessionRef,
      true,
    );
  }

  /** Resolves a session ref to its ticket, refusing another chatbot's session. */
  private async session(sessionRef: string, actor: Principal) {
    const apiKeyId = this.keyOf(actor);
    const found = await this.prisma.chatSession.findUnique({
      where: { apiKeyId_sessionRef: { apiKeyId, sessionRef } },
      include: { ticket: true },
    });
    // Scoped by apiKeyId, so one chatbot cannot address another's conversation
    // even by guessing its session ref — the miss is indistinguishable from a
    // session that never existed, which is the correct thing to leak.
    if (!found) throw new NotFoundException('No such conversation');
    return found;
  }

  async appendMessage(sessionRef: string, dto: AppendMessageDto, actor: Principal) {
    const apiKeyId = this.keyOf(actor);
    const { ticket } = await this.session(sessionRef, actor);

    if (dto.externalRef) {
      const seen = await this.prisma.ticketMessage.findFirst({
        where: { ticketId: ticket.id, externalRef: dto.externalRef },
      });
      if (seen) return { messageId: seen.id, ticketId: ticket.id, duplicate: true };
    }

    const isBot = dto.author === 'bot';
    const message = await this.prisma.$transaction(async () => {
      const created = await this.prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorType: isBot ? 'bot' : 'customer',
          authorId: isBot ? null : ticket.customerId,
          authorApiKeyId: isBot ? apiKeyId : null,
          body: dto.body,
          channel: 'chatbot',
          externalRef: dto.externalRef ?? null,
        },
      });

      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          updatedAt: new Date(),
          // A bot reply stamps its own column and never first_responded_at.
          // Letting it satisfy first response would make the metric meaningless
          // — every conversation compliant in under a second — and would erase
          // any way to measure how fast humans actually answer.
          ...(isBot && !ticket.botRepliedAt ? { botRepliedAt: new Date() } : {}),
          // A visitor writing back to a ticket a human already owns should
          // reopen the human's clock, but only once a human is involved.
          ...(!isBot && ticket.handedOffAt && ticket.status === 'pending'
            ? { status: 'open' as const, slaPausedAt: null }
            : {}),
          // A visitor replying to a FINISHED conversation reopens it.
          //
          // Without this the message is stored and then invisible: the ticket
          // stays `resolved`, so it appears in no open view, in no unassigned
          // queue, and in nothing the SLA sweep looks at. "That did not work,
          // it is still pending" would sit in the database and nobody would
          // ever read it. Losing a customer's reply is worse than reopening a
          // ticket that did not need it.
          //
          // Where it lands is decided by handlingOf(), not here: a conversation
          // the bot resolved alone goes back to the bot (`ai`), while one a
          // human closed returns to them (`escalated`/`assigned`). Clearing the
          // stamps keeps resolution metrics honest — this one was not finished.
          ...(!isBot && (ticket.status === 'resolved' || ticket.status === 'closed')
            ? { status: 'open' as const, resolvedAt: null, closedAt: null, outcome: null }
            : {}),
        },
      });
      return created;
    });

    this.queue.indexTicket(ticket.id);
    this.realtime.publish('message.added', {
      ticketId: ticket.id,
      messageId: message.id,
      isInternalNote: false,
      teamId: ticket.teamId,
      assigneeId: ticket.assigneeId,
    });
    return { messageId: message.id, ticketId: ticket.id, duplicate: false };
  }

  /**
   * The bot gives up and a human takes over. This is where the human SLA clock
   * starts — creation deliberately left it unset.
   */
  async handoff(sessionRef: string, dto: HandoffDto, actor: Principal) {
    const { ticket } = await this.session(sessionRef, actor);
    if (ticket.handedOffAt) {
      return {
        ticketId: ticket.id,
        status: ticket.status,
        handling: handlingOf(ticket as never),
        handedOffAt: ticket.handedOffAt,
        alreadyHandedOff: true,
      };
    }

    const priority = dto.priority ?? ticket.priority;
    const now = new Date();
    const due = await this.sla.computeDueTimes(priority, now);

    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        handedOffAt: now,
        priority,
        status: ticket.status === 'new' ? 'open' : ticket.status,
        outcome: 'escalated',
        slaPolicyId: due.policyId,
        firstResponseDueAt: due.firstResponseDueAt,
        resolutionDueAt: due.resolutionDueAt,
        ...(dto.reason
          ? { messages: { create: { authorType: 'system' as const, body: `Handed off by the chatbot: ${dto.reason}`, isInternalNote: true, channel: 'chatbot' as const } } }
          : {}),
      },
    });

    await this.audit.write({ actor, entityType: 'ticket', entityId: ticket.id, action: 'chat.handoff' });
    this.queue.deliverWebhooks('ticket.updated', { id: ticket.id, handedOff: true });
    this.realtime.publish('ticket.updated', {
      id: ticket.id,
      number: Number(updated.number),
      teamId: updated.teamId,
      assigneeId: updated.assigneeId,
    });
    return {
      ticketId: ticket.id,
      status: updated.status,
      handling: handlingOf(updated as never),
      handedOffAt: now,
      alreadyHandedOff: false,
    };
  }

  /** The bot answered the question and is closing the conversation itself. */
  async resolve(sessionRef: string, dto: ResolveDto, actor: Principal) {
    const { ticket } = await this.session(sessionRef, actor);
    if (ticket.handedOffAt) {
      throw new ForbiddenException('A human owns this conversation now');
    }
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      return {
        ticketId: ticket.id,
        status: ticket.status,
        handling: handlingOf(ticket as never),
        alreadyResolved: true,
      };
    }
    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'resolved', resolvedAt: new Date(), outcome: dto.outcome ?? 'answered' },
    });
    await this.audit.write({ actor, entityType: 'ticket', entityId: ticket.id, action: 'chat.resolve' });
    this.realtime.publish('ticket.updated', {
      id: ticket.id,
      number: Number(updated.number),
      teamId: updated.teamId,
      assigneeId: updated.assigneeId,
    });
    return {
      ticketId: ticket.id,
      status: updated.status,
      handling: handlingOf(updated as never),
      alreadyResolved: false,
    };
  }

  async getConversation(sessionRef: string, actor: Principal) {
    const { ticket } = await this.session(sessionRef, actor);
    const messages = await this.prisma.ticketMessage.findMany({
      // Internal notes are excluded without exception: they are where agents
      // talk to each other, and the partner relays what it receives to the
      // visitor.
      where: { ticketId: ticket.id, isInternalNote: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true, authorType: true, body: true, createdAt: true, externalRef: true },
    });
    return {
      ...this.sessionView(ticket, sessionRef, false),
      messages: messages.map((m) => ({
        id: m.id,
        author: m.authorType === 'agent' ? 'agent' : m.authorType === 'bot' ? 'bot' : 'visitor',
        body: m.body,
        at: m.createdAt,
        externalRef: m.externalRef,
      })),
    };
  }

  /**
   * The outbound direction: agent replies the partner has not seen yet.
   *
   * A cursor rather than webhooks, for the first release. Polling needs no
   * infrastructure on either side, no signature scheme, no retry queue, and
   * cannot silently drop messages while the partner's endpoint is down or
   * misconfigured. Webhooks can be added later as an optimisation without
   * changing this contract — and the cursor is still the backstop when they fail.
   */
  async updates(dto: UpdatesDto, actor: Principal) {
    const apiKeyId = this.keyOf(actor);
    const since = dto.since ? new Date(dto.since) : new Date(Date.now() - 24 * 3600_000);
    if (Number.isNaN(since.getTime())) throw new NotFoundException('Invalid `since` cursor');
    const limit = dto.limit ?? 50;

    const rows = await this.prisma.ticketMessage.findMany({
      where: {
        createdAt: { gt: since },
        isInternalNote: false,
        authorType: 'agent', // only human replies; the bot already knows its own
        ticket: { chatSessions: { some: { apiKeyId } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        body: true,
        createdAt: true,
        ticket: { select: { id: true, status: true, chatSessions: { where: { apiKeyId }, select: { sessionRef: true } } } },
      },
    });

    return {
      // Echoing the cursor back means the partner never has to compute it, and a
      // page of zero rows still advances nothing — so nothing is skipped.
      cursor: rows.length ? rows[rows.length - 1].createdAt.toISOString() : since.toISOString(),
      hasMore: rows.length === limit,
      updates: rows.map((m) => ({
        messageId: m.id,
        sessionRef: m.ticket.chatSessions[0]?.sessionRef ?? null,
        ticketId: m.ticket.id,
        status: m.ticket.status,
        body: m.body,
        at: m.createdAt,
      })),
    };
  }

  private sessionView(
    ticket: { id: string; status: string; handedOffAt: Date | null; createdByApiKeyId?: string | null; assigneeId?: string | null },
    sessionRef: string,
    created: boolean,
  ) {
    return {
      ticketId: ticket.id, // never `number` — see the module docblock
      sessionRef,
      status: ticket.status,
      // Who is answering right now, so the partner's widget can say "an agent
      // will reply" rather than guessing from `status` + `handedOff`.
      handling: handlingOf({
        status: ticket.status as never,
        createdByApiKeyId: ticket.createdByApiKeyId ?? 'bot',
        handedOffAt: ticket.handedOffAt,
        assigneeId: ticket.assigneeId ?? null,
      }),
      handedOff: !!ticket.handedOffAt,
      created,
    };
  }

  private subjectFrom(message?: string): string | null {
    if (!message) return null;
    const line = message.trim().split('\n')[0].slice(0, 120);
    return line || null;
  }
}

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('conversations')
  @AllowApiKey()
  @Scopes('chat:write')
  open(@Body() dto: OpenConversationDto, @CurrentUser() actor: Principal) {
    return this.chat.openConversation(dto, actor);
  }

  @Get('conversations/:sessionRef')
  @AllowApiKey()
  @Scopes('chat:read')
  get(@Param('sessionRef') sessionRef: string, @CurrentUser() actor: Principal) {
    return this.chat.getConversation(sessionRef, actor);
  }

  @Post('conversations/:sessionRef/messages')
  @AllowApiKey()
  @Scopes('chat:write')
  append(@Param('sessionRef') sessionRef: string, @Body() dto: AppendMessageDto, @CurrentUser() actor: Principal) {
    return this.chat.appendMessage(sessionRef, dto, actor);
  }

  @Post('conversations/:sessionRef/handoff')
  @AllowApiKey()
  @Scopes('chat:write')
  handoff(@Param('sessionRef') sessionRef: string, @Body() dto: HandoffDto, @CurrentUser() actor: Principal) {
    return this.chat.handoff(sessionRef, dto, actor);
  }

  @Post('conversations/:sessionRef/resolve')
  @AllowApiKey()
  @Scopes('chat:write')
  resolve(@Param('sessionRef') sessionRef: string, @Body() dto: ResolveDto, @CurrentUser() actor: Principal) {
    return this.chat.resolve(sessionRef, dto, actor);
  }

  @Get('updates')
  @AllowApiKey()
  @Scopes('chat:read')
  updates(@Query() dto: UpdatesDto, @CurrentUser() actor: Principal) {
    return this.chat.updates(dto, actor);
  }
}

@Module({
  imports: [TicketsModule, SlaModule, CustomersModule, RealtimeModule],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
