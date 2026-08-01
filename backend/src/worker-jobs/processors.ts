import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES, DEFAULT_JOB_OPTS } from '../queue/queue.constants';
import { QueueProducer } from '../queue/queue.producer';
import { EmailService } from '../email/email.service';
import { RealtimeService } from '../realtime/realtime.service';
import { EVENT_API_TO_DB, EVENT_DB_TO_API } from '../webhooks/webhooks.module';

// ---- email.outbound ----------------------------------------------------------

@Processor(QUEUES.EMAIL_OUTBOUND)
export class EmailOutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailOutboundProcessor.name);
  constructor(private readonly email: EmailService) {
    super();
  }

  async process(job: Job<{ ticketId: string; messageId: string }>) {
    await this.email.sendTicketReply(job.data.ticketId, job.data.messageId);
  }
}

// ---- email.inbound -----------------------------------------------------------

@Processor(QUEUES.EMAIL_INBOUND)
export class EmailInboundProcessor extends WorkerHost {
  constructor(
    private readonly email: EmailService,
    private readonly queue: QueueProducer,
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<{ raw?: string; parsed?: Record<string, unknown> }>) {
    const ticketId = await this.email.processInbound(job.data as never);
    if (ticketId) {
      this.queue.indexTicket(ticketId);
      const t = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { teamId: true, assigneeId: true },
      });
      this.realtime.publish('message.added', {
        ticketId,
        source: 'email',
        teamId: t?.teamId ?? null,
        assigneeId: t?.assigneeId ?? null,
      });
    }
  }
}

// ---- webhook.deliver -----------------------------------------------------------

@Processor(QUEUES.WEBHOOK_DELIVER, { concurrency: 4 })
export class WebhookDeliverProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliverProcessor.name);
  private static readonly MAX_ATTEMPTS = 6;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * 'fanout' creates one delivery row per subscribed endpoint, then delivers
   * each; 'deliver' retries a single delivery row (self-scheduled backoff).
   */
  async process(job: Job) {
    if (job.name === 'fanout') return this.fanout(job.data as { event: string; payload: Record<string, unknown> });
    if (job.name === 'deliver') return this.deliver((job.data as { deliveryId: string }).deliveryId, job);
  }

  private async fanout(data: { event: string; payload: Record<string, unknown> }) {
    const dbEvent = EVENT_API_TO_DB[data.event];
    if (!dbEvent) return;
    const hooks = await this.prisma.webhook.findMany({
      where: { isActive: true, events: { has: dbEvent as never } },
    });
    for (const hook of hooks) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: { webhookId: hook.id, event: dbEvent as never, payloadJson: data.payload as object },
      });
      await this.deliverOnce(delivery.id);
    }
  }

  private async deliver(deliveryId: string, _job: Job) {
    await this.deliverOnce(deliveryId);
  }

  /** POST the signed payload; record the outcome; schedule a retry on failure. */
  private async deliverOnce(deliveryId: string) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });
    if (!delivery || delivery.status === 'delivered') return;

    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      // subscribers registered for the dotted API name — send that back, not
      // the Prisma enum member (ticket.created, never ticket_created)
      event: EVENT_DB_TO_API[delivery.event] ?? delivery.event,
      payload: delivery.payloadJson,
      timestamp,
    });
    const signature = createHmac('sha256', delivery.webhook.secret).update(body).digest('hex');

    try {
      const res = await fetch(delivery.webhook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-plumo-signature': `t=${timestamp},v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'delivered', attempts: { increment: 1 }, deliveredAt: new Date(), lastError: null },
      });
    } catch (err) {
      const attempts = delivery.attempts + 1;
      const failedForGood = attempts >= WebhookDeliverProcessor.MAX_ATTEMPTS;
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: failedForGood ? 'failed' : 'pending',
          attempts,
          lastError: (err as Error).message,
        },
      });
      if (failedForGood) {
        this.logger.warn(`Webhook delivery ${deliveryId} failed after ${attempts} attempts`);
      } else {
        // exponential backoff via a delayed re-enqueue of this one delivery.
        // Carry the root defaultJobOptions so retries are still reaped from
        // Redis; without them a flapping endpoint grows keys without bound.
        const delay = Math.min(2 ** attempts * 5_000, 3_600_000);
        const { Queue } = await import('bullmq');
        const queue = new Queue(QUEUES.WEBHOOK_DELIVER, {
          connection: (this.worker as never as { opts: { connection: object } }).opts.connection as never,
          defaultJobOptions: DEFAULT_JOB_OPTS,
        });
        await queue.add('deliver', { deliveryId }, { delay, attempts: 1 });
        await queue.close();
      }
    }
  }
}

// ---- sla.sweep -------------------------------------------------------------------

@Processor(QUEUES.SLA_SWEEP)
export class SlaSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaSweepProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueProducer,
    private readonly realtime: RealtimeService,
  ) {
    super();
  }

  /**
   * Runs every minute (repeatable): find open tickets whose first-response
   * due time is near or past, emit due-soon/breach events once per ticket.
   */
  /** Never let one sweep tail off unboundedly; the next run picks up the rest. */
  private static readonly BATCH = 500;

  async process(_job: Job) {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 60_000);

    const candidates = await this.prisma.ticket.findMany({
      where: {
        status: { in: ['new', 'open'] },
        slaPausedAt: null,
        firstRespondedAt: null,
        firstResponseDueAt: { lte: soon },
      },
      select: {
        id: true, number: true, subject: true, assigneeId: true, teamId: true,
        firstResponseDueAt: true, tags: true,
      } as const,
      orderBy: { firstResponseDueAt: 'asc' }, // most overdue first
      take: SlaSweepProcessor.BATCH,
    });
    if (candidates.length === 0) return;

    // One query for every team's leads instead of one per ticket (was an N+1).
    const teamIds = [...new Set(candidates.map((t) => t.teamId).filter(Boolean))] as string[];
    const leadsByTeam = new Map<string, string[]>();
    if (teamIds.length) {
      const leads = await this.prisma.user.findMany({
        where: { teamId: { in: teamIds }, role: 'lead', isActive: true },
        select: { id: true, teamId: true },
      });
      for (const l of leads) {
        if (!l.teamId) continue;
        const arr = leadsByTeam.get(l.teamId) ?? [];
        arr.push(l.id);
        leadsByTeam.set(l.teamId, arr);
      }
    }

    for (const t of candidates) {
      const breached = t.firstResponseDueAt! <= now;
      const marker = breached ? 'sla:breached' : 'sla:due-soon';
      if (t.tags.includes(marker)) continue; // cheap pre-filter; SQL below is authoritative

      // Raw SQL on purpose, for two reasons:
      //  - a Prisma update would bump updated_at (@updatedAt) and churn the
      //    inbox's "last updated" sort on every sweep;
      //  - the NOT (tags @> ...) guard makes the append idempotent *in the
      //    database*. The in-memory check above is a read from a snapshot taken
      //    before this loop, so two overlapping sweeps could otherwise both pass
      //    it and append the marker twice.
      const appended = await this.prisma.$executeRaw(
        Prisma.sql`UPDATE tickets
                   SET tags = array_append(tags, ${marker})
                   WHERE id = ${t.id}::uuid
                     AND NOT (tags @> ARRAY[${marker}]::text[])`,
      );
      // another worker got there first — it already sent the notifications
      if (appended === 0) continue;

      // notify the assignee and their team lead
      const notifyIds = new Set<string>();
      if (t.assigneeId) notifyIds.add(t.assigneeId);
      if (t.teamId) (leadsByTeam.get(t.teamId) ?? []).forEach((id) => notifyIds.add(id));
      if (notifyIds.size) {
        this.queue.notify({
          kind: breached ? 'sla_breach' : 'sla_warning',
          userIds: [...notifyIds],
          text: breached
            ? `#${t.number} first response is overdue`
            : `#${t.number} first reply is due very soon`,
          ticketId: t.id,
          email: breached,
        });
      }
      if (breached) {
        this.queue.deliverWebhooks('sla.breached', {
          ticketId: t.id,
          number: Number(t.number),
          subject: t.subject,
          firstResponseDueAt: t.firstResponseDueAt,
        });
      }
      this.realtime.publish('sla.warning', {
        ticketId: t.id,
        breached,
        teamId: t.teamId,
        assigneeId: t.assigneeId,
      });
    }
    if (candidates.length) this.logger.log(`SLA sweep touched ${candidates.length} ticket(s)`);
  }
}

// ---- search.index ------------------------------------------------------------------

@Processor(QUEUES.SEARCH_INDEX)
export class SearchIndexProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ ticketId: string }>) {
    try {
      await this.prisma.$executeRaw(Prisma.sql`SELECT refresh_ticket_tsv(${job.data.ticketId}::uuid)`);
    } catch {
      // search_tsv extras not installed — harmless in dev
    }
  }
}

// ---- notifications.fanout -------------------------------------------------------------

@Processor(QUEUES.NOTIFICATIONS_FANOUT)
export class NotificationsFanoutProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly realtime: RealtimeService,
  ) {
    super();
  }

  async process(job: Job<{ kind: string; userIds: string[]; text: string; ticketId?: string; email?: boolean }>) {
    const { kind, userIds, text, ticketId, email } = job.data;

    if (kind === 'password_reset') {
      // no in-app row; just the email (text carries the link)
      const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
      for (const u of users) await this.email.sendNotification(u.email, 'reset your plumo password', text);
      return;
    }

    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, kind, text, ticketId: ticketId ?? null })),
    });
    this.realtime.publish('notification.created', { userIds, kind, text, ticketId: ticketId ?? null });

    if (email) {
      const users = await this.prisma.user.findMany({ where: { id: { in: userIds }, isActive: true } });
      for (const u of users) {
        await this.email.sendNotification(u.email, `plumo — ${kind.replace('_', ' ')}`, text);
      }
    }
  }
}

// ---- export.daily -----------------------------------------------------------------------

@Processor(QUEUES.EXPORT_DAILY)
export class ExportDailyProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportDailyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  /**
   * Watermarked batch export (§10).
   *
   * The cursor lives in its own `export_state` row rather than a synthetic
   * audit_log entry — audit_log is an append-only compliance record and will be
   * partitioned for retention, which would have taken the cursor with it.
   *
   * The watermark is a (updated_at, id) pair, not just a timestamp: several
   * tickets can share an updated_at (a bulk close), and a strict `>` on the
   * timestamp alone would skip the rest of that group forever. The payload goes
   * to the log in dev — swap `emit` for the partner call in production.
   */
  async process(_job: Job) {
    const state = await this.prisma.exportState.findUnique({ where: { id: 'daily' } });
    const since = state?.watermark ?? new Date(0);

    const tickets = await this.prisma.ticket.findMany({
      where: { updatedAt: { gte: since } },
      select: {
        id: true, number: true, subject: true, status: true, priority: true,
        channel: true, outcome: true, createdAt: true, updatedAt: true,
        resolvedAt: true, firstRespondedAt: true, tags: true,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 5_000,
    });
    if (tickets.length === 0) {
      this.logger.log('Export: nothing new since watermark');
      return;
    }

    const newWatermark = tickets[tickets.length - 1].updatedAt;
    this.emit(tickets);

    await this.prisma.exportState.upsert({
      where: { id: 'daily' },
      create: { id: 'daily', watermark: newWatermark, lastCount: tickets.length },
      update: { watermark: newWatermark, lastCount: tickets.length, lastRunAt: new Date() },
    });
    this.logger.log(
      `Exported ${tickets.length} ticket(s); watermark → ${newWatermark.toISOString()}`,
    );
  }

  private emit(tickets: unknown[]) {
    // Partner integration point. Redaction before anything leaves the boundary
    // happens here (PII is already excluded from the selected fields).
    this.logger.log(`[export.daily] batch of ${tickets.length} ready`);
  }
}
