import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The workspace this job belongs to.
   *
   * A JOB CARRIES NO REQUEST, so the worker has nothing to bind from and runs
   * with app_current_workspace() = NULL. Under RLS that is not an error — every
   * SELECT returns zero rows and every INSERT is rejected, so a processor
   * "succeeds" having done nothing at all. That is how agent replies stopped
   * reaching customers with no error anywhere: sendTicketReply looked up its
   * message, saw null, and returned.
   *
   * Read here rather than threaded through 20 call sites because every producer
   * call happens inside the request transaction that just wrote the row the job
   * is about — the binding is already established and correct. One trivial query
   * per enqueue, on a connection that is already open.
   */
  private async currentWorkspaceId(): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ ws: string | null }>>(
        Prisma.sql`SELECT app_current_workspace() AS ws`,
      );
      return rows[0]?.ws ?? null;
    } catch (err) {
      // Never fail the request for this. A job that arrives unstamped is refused
      // loudly by the processor, which is the outcome we want anyway.
      this.logger.error(`Could not read the bound workspace: ${(err as Error).message}`);
      return null;
    }
  }

  private async safeAdd(queue: Queue, name: string, data: Record<string, unknown>) {
    try {
      const workspaceId = await this.currentWorkspaceId();
      await queue.add(name, { ...data, workspaceId });
    } catch (err) {
      this.logger.error(`Failed to enqueue ${queue.name}/${name}: ${(err as Error).message}`);
    }
  }

  /** Enqueue without a workspace — for jobs that iterate every tenant themselves. */
  private async safeAddUnscoped(queue: Queue, name: string, data: Record<string, unknown>) {
    try {
      await queue.add(name, data);
    } catch (err) {
      this.logger.error(`Failed to enqueue ${queue.name}/${name}: ${(err as Error).message}`);
    }
  }

  sendEmail(data: { ticketId: string; messageId: string }) {
    return this.safeAdd(this.emailOutbound, 'send', data);
  }

  /**
   * The workspace is passed in, not read from the connection.
   *
   * Every other producer here reads app_current_workspace() because it is called
   * inside the request transaction that just wrote the row the job is about. The
   * inbound webhook is @Public and therefore runs UNBOUND — safeAdd would stamp
   * null over a perfectly good workspace id and every inbound job would fail the
   * processor's requireWorkspace check. The caller has already resolved the desk
   * from the recipient address (EmailService.routeInbound); this just carries it.
   *
   * Errors are NOT swallowed here, unlike safeAdd. That helper protects requests
   * whose transaction has already committed — losing the job is then better than
   * a 500 over work that is already done. Nothing has been written yet on this
   * path: a swallowed enqueue failure silently destroys a customer's email, while
   * letting it through means a 5xx and the mail provider retries.
   */
  async parseInboundEmail(
    data: { raw?: string; parsed?: Record<string, unknown> },
    workspaceId: string,
  ) {
    await this.emailInbound.add('parse', { ...data, workspaceId });
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

  /** Unscoped: the export loops over every workspace itself. */
  runExport(data: { requestedBy?: string } = {}) {
    return this.safeAddUnscoped(this.exportDaily, 'run', data);
  }
}
