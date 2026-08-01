import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from './queue.constants';

/**
 * The API's single door into the queues — "enqueue, don't block".
 * Failures to enqueue are logged, never allowed to fail the request
 * (the transaction has already committed).
 */
@Injectable()
export class QueueProducer {
  private readonly logger = new Logger(QueueProducer.name);

  constructor(
    @InjectQueue(QUEUES.EMAIL_OUTBOUND) private readonly emailOutbound: Queue,
    @InjectQueue(QUEUES.EMAIL_INBOUND) private readonly emailInbound: Queue,
    @InjectQueue(QUEUES.WEBHOOK_DELIVER) private readonly webhookDeliver: Queue,
    @InjectQueue(QUEUES.SEARCH_INDEX) private readonly searchIndex: Queue,
    @InjectQueue(QUEUES.NOTIFICATIONS_FANOUT) private readonly notificationsFanout: Queue,
    @InjectQueue(QUEUES.EXPORT_DAILY) private readonly exportDaily: Queue,
  ) {}

  private async safeAdd(queue: Queue, name: string, data: unknown) {
    try {
      await queue.add(name, data);
    } catch (err) {
      this.logger.error(`Failed to enqueue ${queue.name}/${name}: ${(err as Error).message}`);
    }
  }

  sendEmail(data: { ticketId: string; messageId: string }) {
    return this.safeAdd(this.emailOutbound, 'send', data);
  }

  parseInboundEmail(data: { raw?: string; parsed?: Record<string, unknown> }) {
    return this.safeAdd(this.emailInbound, 'parse', data);
  }

  deliverWebhooks(event: string, payload: Record<string, unknown>) {
    return this.safeAdd(this.webhookDeliver, 'fanout', { event, payload });
  }

  indexTicket(ticketId: string) {
    return this.safeAdd(this.searchIndex, 'index', { ticketId });
  }

  notify(data: { kind: string; userIds: string[]; text: string; ticketId?: string; email?: boolean }) {
    return this.safeAdd(this.notificationsFanout, 'fanout', data);
  }

  runExport(data: { requestedBy?: string } = {}) {
    return this.safeAdd(this.exportDaily, 'run', data);
  }
}
