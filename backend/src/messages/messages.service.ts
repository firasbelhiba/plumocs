import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueProducer } from '../queue/queue.producer';
import { RealtimeService } from '../realtime/realtime.service';
import { TeamScopeService } from '../common/guards/team-scope.service';
import { Principal } from '../common/decorators';
import { CreateMessageDto } from './dto/create-message.dto';

/**
 * Replies and internal notes (§6 MessagesModule).
 * First response is stamped the moment an agent posts a non-internal message;
 * outbound email + webhooks + realtime are enqueued, never awaited inline.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueProducer,
    private readonly realtime: RealtimeService,
    private readonly scope: TeamScopeService,
  ) {}

  async add(ticketId: string, dto: CreateMessageDto, actor: Principal) {
    const ticket = await this.scope.loadAndAssert(ticketId, actor);

    const isNote = !!dto.isInternalNote;
    const isAgentMessage = actor.kind === 'user';

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.ticketMessage.create({
        data: {
          ticketId,
          authorType: isAgentMessage ? 'agent' : 'system',
          authorId: isAgentMessage ? actor.id : null,
          body: dto.body,
          isInternalNote: isNote,
          channel: ticket.channel,
        },
        include: { attachments: true },
      });

      if (dto.attachmentIds?.length) {
        // only pending (unlinked) uploads may be claimed — otherwise a caller
        // could re-parent another team's attachment onto their own message
        await tx.attachment.updateMany({
          where: { id: { in: dto.attachmentIds }, ticketMessageId: null },
          data: { ticketMessageId: msg.id },
        });
      }

      // first-response stamping — internal notes don't count (§9)
      const stampFirstResponse = isAgentMessage && !isNote && !ticket.firstRespondedAt;
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          updatedAt: new Date(),
          ...(stampFirstResponse ? { firstRespondedAt: new Date() } : {}),
          // a public agent reply to a 'new' ticket moves it to open
          ...(isAgentMessage && !isNote && ticket.status === 'new' ? { status: 'open' } : {}),
          // A human replying TAKES the conversation from the bot, whether or not
          // anyone called /handoff. Agents answer straight out of the inbox all
          // the time; before this, handedOffAt stayed null, `handling` stayed
          // 'ai', and the chatbot carried on answering over the top of a person.
          // handedOffAt is stamped too so the response clock starts from the
          // moment a human actually engaged.
          ...(isAgentMessage && !isNote
            ? {
                botEnabled: false,
                ...(ticket.handedOffAt ? {} : { handedOffAt: new Date() }),
              }
            : {}),
        },
      });
      return msg;
    });

    await this.audit.write({
      actor, entityType: 'ticket', entityId: ticketId,
      action: isNote ? 'note.add' : 'message.add',
    });

    if (!isNote) {
      // outbound email to the customer (worker renders + sends)
      this.queue.sendEmail({ ticketId, messageId: message.id });
      this.queue.deliverWebhooks('message.added', {
        ticketId,
        messageId: message.id,
        authorType: message.authorType,
        createdAt: message.createdAt,
      });
    }
    this.queue.indexTicket(ticketId);
    this.realtime.publish('message.added', {
      workspaceId: actor.workspaceId,
      ticketId,
      messageId: message.id,
      isInternalNote: isNote,
      teamId: ticket.teamId,
      assigneeId: ticket.assigneeId,
    });
    return message;
  }

  async listForTicket(ticketId: string, actor: Principal) {
    const ticket = await this.scope.loadAndAssert(ticketId, actor);
    const messages = await this.prisma.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      include: { attachments: true },
    });
    if (!messages) throw new NotFoundException();
    return messages;
  }
}
