import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WorkspaceContextService } from "../common/workspace/workspace-context.service";
import { QUEUES, DEFAULT_JOB_OPTS } from "../queue/queue.constants";
import { QueueProducer } from "../queue/queue.producer";
import { EmailService } from "../email/email.service";
import { RealtimeService } from "../realtime/realtime.service";
import { EVENT_API_TO_DB, EVENT_DB_TO_API } from "../webhooks/webhooks.module";

// ---- email.outbound ----------------------------------------------------------

/**
 * The workspace a job belongs to, or a loud failure.
 *
 * A JOB HAS NO REQUEST, so nothing binds a workspace and the processor runs with
 * app_current_workspace() = NULL. Under RLS that is silent rather than fatal:
 * reads return zero rows, writes are rejected, and the processor reports success
 * having done nothing. That is exactly how agent replies stopped reaching
 * customers — sendTicketReply looked up its message, RLS hid it, and the bare
 * `return` at email.service.ts:45 made it indistinguishable from "nothing to do".
 *
 * Throwing here is the point. A job queued before workspaceId was stamped will
 * now fail and be retried into the dead-letter set, where it is visible, instead
 * of quietly evaporating.
 */
function requireWorkspace(job: Job<{ workspaceId?: string }>): string {
  const workspaceId = job.data?.workspaceId;
  if (!workspaceId) {
    throw new Error(
      `${job.queueName}/${job.name} carries no workspaceId. Running it unbound would read zero rows ` +
        `and write nothing while reporting success. Jobs enqueued before this fix must be drained or requeued.`,
    );
  }
  return workspaceId;
}

@Processor(QUEUES.EMAIL_OUTBOUND)
export class EmailOutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailOutboundProcessor.name);
  constructor(
    private readonly email: EmailService,
    private readonly workspaces: WorkspaceContextService,
  ) {
    super();
  }

  async process(job: Job<{ ticketId: string; messageId: string; workspaceId?: string }>) {
    const workspaceId = requireWorkspace(job);
    await this.workspaces.runInWorkspace(workspaceId, () =>
      this.email.sendTicketReply(job.data.ticketId, job.data.messageId),
    );
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
    private readonly workspaces: WorkspaceContextService,
  ) {
    super();
  }

  /**
   * The tenant is decided BEFORE the job exists, not here.
   *
   * The inbound webhook resolves the recipient address against
   * workspaces.inbound_email and stamps the workspace on the job
   * (EmailService.routeInbound); a message that matches no desk is refused at the
   * door and never reaches this queue. So requireWorkspace below is a backstop,
   * not the routing: it catches jobs enqueued before that landed, and any future
   * producer that forgets.
   *
   * Inventing a tenant here remains the one thing that must not happen. Guessing
   * the sole workspace worked while there was only one; there are two, and the
   * wrong guess files a stranger's email into another customer's desk and threads
   * their reply into that desk's conversation.
   *
   * The binding has to wrap the whole body, not just processInbound: the
   * findUnique below reads `tickets`, and unbound it returns null under RLS —
   * which would ship teamId/assigneeId as null and route the event to the
   * admin+lead room instead of the team that owns the ticket.
   */
  async process(
    job: Job<{
      raw?: string;
      parsed?: Record<string, unknown>;
      workspaceId?: string;
    }>,
  ) {
    const workspaceId = requireWorkspace(job);
    await this.workspaces.runInWorkspace(workspaceId, async () => {
      const ticketId = await this.email.processInbound(job.data as never);
      if (!ticketId) return;
      this.queue.indexTicket(ticketId);
      const t = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { teamId: true, assigneeId: true },
      });
      this.realtime.publish("message.added", {
        workspaceId,
        ticketId,
        source: "email",
        teamId: t?.teamId ?? null,
        assigneeId: t?.assigneeId ?? null,
      });
    });
  }
}

// ---- webhook.deliver -----------------------------------------------------------

@Processor(QUEUES.WEBHOOK_DELIVER, { concurrency: 4 })
export class WebhookDeliverProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliverProcessor.name);
  private static readonly MAX_ATTEMPTS = 6;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceContextService,
  ) {
    super();
  }

  /**
   * 'fanout' creates one delivery row per subscribed endpoint, then delivers
   * each; 'deliver' retries a single delivery row (self-scheduled backoff).
   */
  async process(job: Job) {
    // Both branches read and write workspace-scoped tables — webhooks,
    // webhook_deliveries — so both need the binding. Unbound, fanout finds no
    // webhooks at all and reports a clean delivery of nothing.
    const workspaceId = requireWorkspace(job as Job<{ workspaceId?: string }>);
    return this.workspaces.runInWorkspace(workspaceId, async () => {
      if (job.name === "fanout")
        return this.fanout(
          job.data as { event: string; payload: Record<string, unknown> },
          workspaceId,
        );
      if (job.name === "deliver")
        return this.deliver((job.data as { deliveryId: string }).deliveryId, job);
    });
  }

  private async fanout(
    data: { event: string; payload: Record<string, unknown> },
    workspaceId: string,
  ) {
    const dbEvent = EVENT_API_TO_DB[data.event];
    if (!dbEvent) return;
    const hooks = await this.prisma.webhook.findMany({
      where: { isActive: true, events: { has: dbEvent as never } },
    });
    for (const hook of hooks) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          event: dbEvent as never,
          payloadJson: data.payload as object,
        },
      });
      await this.deliverOnce(delivery.id, workspaceId);
    }
  }

  // `job` was previously unused (`_job`). The retry re-enqueue below now needs
  // it, to carry workspaceId onto the new job.
  private async deliver(deliveryId: string, job: Job<{ workspaceId?: string }>) {
    await this.deliverOnce(deliveryId, job.data?.workspaceId);
  }

  /** POST the signed payload; record the outcome; schedule a retry on failure. */
  private async deliverOnce(deliveryId: string, workspaceId?: string) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });
    if (!delivery || delivery.status === "delivered") return;

    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      // subscribers registered for the dotted API name — send that back, not
      // the Prisma enum member (ticket.created, never ticket_created)
      event: EVENT_DB_TO_API[delivery.event] ?? delivery.event,
      payload: delivery.payloadJson,
      timestamp,
    });
    const signature = createHmac("sha256", delivery.webhook.secret)
      .update(body)
      .digest("hex");

    try {
      const res = await fetch(delivery.webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-plumo-signature": `t=${timestamp},v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "delivered",
          attempts: { increment: 1 },
          deliveredAt: new Date(),
          lastError: null,
        },
      });
    } catch (err) {
      const attempts = delivery.attempts + 1;
      const failedForGood = attempts >= WebhookDeliverProcessor.MAX_ATTEMPTS;
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: failedForGood ? "failed" : "pending",
          attempts,
          lastError: (err as Error).message,
        },
      });
      if (failedForGood) {
        this.logger.warn(
          `Webhook delivery ${deliveryId} failed after ${attempts} attempts`,
        );
      } else {
        // exponential backoff via a delayed re-enqueue of this one delivery.
        // Carry the root defaultJobOptions so retries are still reaped from
        // Redis; without them a flapping endpoint grows keys without bound.
        const delay = Math.min(2 ** attempts * 5_000, 3_600_000);
        const { Queue } = await import("bullmq");
        const queue = new Queue(QUEUES.WEBHOOK_DELIVER, {
          connection: (this.worker as never as { opts: { connection: object } })
            .opts.connection as never,
          defaultJobOptions: DEFAULT_JOB_OPTS,
        });
        // Carry workspaceId forward. A retry is a new job with a fresh payload,
        // so omitting it would make every retry of every webhook fail the
        // requireWorkspace check — turning a transient endpoint outage into a
        // permanent delivery failure.
        await queue.add(
          "deliver",
          { deliveryId, workspaceId },
          { delay, attempts: 1 },
        );
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
    private readonly workspaces: WorkspaceContextService,
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
    // Bound per workspace, for the same reason as the export: an unbound query
    // returns zero rows under RLS, so an unbound sweep finds no candidates and
    // silently does nothing — no breach tags, no lead notifications, no error.
    await this.workspaces.forEachWorkspace((workspaceId) =>
      this.sweepWorkspace(workspaceId),
    );
  }

  // Takes the id forEachWorkspace already resolved rather than re-reading the
  // binding: the realtime event below leaves this process, so it has to name the
  // desk explicitly — the gateway on another replica has no binding to consult.
  private async sweepWorkspace(workspaceId: string) {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 60_000);

    const candidates = await this.prisma.ticket.findMany({
      where: {
        status: { in: ["new", "open"] },
        slaPausedAt: null,
        firstRespondedAt: null,
        firstResponseDueAt: { lte: soon },
      },
      select: {
        id: true,
        number: true,
        subject: true,
        assigneeId: true,
        teamId: true,
        firstResponseDueAt: true,
        tags: true,
      } as const,
      orderBy: { firstResponseDueAt: "asc" }, // most overdue first
      take: SlaSweepProcessor.BATCH,
    });
    if (candidates.length === 0) return;

    // One query for every team's leads instead of one per ticket (was an N+1).
    const teamIds = [
      ...new Set(candidates.map((t) => t.teamId).filter(Boolean)),
    ] as string[];
    const leadsByTeam = new Map<string, string[]>();
    if (teamIds.length) {
      // Memberships, not users — role and team both live there now.
      //
      // No workspace filter is needed and none is wanted: these team ids came
      // from the tickets being swept, and a team belongs to exactly one
      // workspace, so filtering on them is already workspace-scoped. Adding a
      // workspace filter here would mean picking ONE, and this sweep is
      // deliberately cross-workspace — it runs unattended over every desk.
      //
      // `user: { isActive: true }` as well as the membership's own flag: a
      // disabled account should not be paged by any desk.
      const leads = await this.prisma.workspaceMembership.findMany({
        where: {
          teamId: { in: teamIds },
          role: "lead",
          isActive: true,
          user: { isActive: true },
        },
        select: { userId: true, teamId: true },
      });
      for (const l of leads) {
        if (!l.teamId) continue;
        const arr = leadsByTeam.get(l.teamId) ?? [];
        arr.push(l.userId);
        leadsByTeam.set(l.teamId, arr);
      }
    }

    for (const t of candidates) {
      const breached = t.firstResponseDueAt! <= now;
      const marker = breached ? "sla:breached" : "sla:due-soon";
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
      if (t.teamId)
        (leadsByTeam.get(t.teamId) ?? []).forEach((id) => notifyIds.add(id));
      if (notifyIds.size) {
        this.queue.notify({
          kind: breached ? "sla_breach" : "sla_warning",
          userIds: [...notifyIds],
          text: breached
            ? `#${t.number} first response is overdue`
            : `#${t.number} first reply is due very soon`,
          ticketId: t.id,
          email: breached,
        });
      }
      if (breached) {
        this.queue.deliverWebhooks("sla.breached", {
          ticketId: t.id,
          number: Number(t.number),
          subject: t.subject,
          firstResponseDueAt: t.firstResponseDueAt,
        });
      }
      this.realtime.publish("sla.warning", {
        workspaceId,
        ticketId: t.id,
        breached,
        teamId: t.teamId,
        assigneeId: t.assigneeId,
      });
    }
    if (candidates.length)
      this.logger.log(`SLA sweep touched ${candidates.length} ticket(s)`);
  }
}

// ---- search.index ------------------------------------------------------------------

@Processor(QUEUES.SEARCH_INDEX)
export class SearchIndexProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceContextService,
  ) {
    super();
  }

  async process(job: Job<{ ticketId: string; workspaceId?: string }>) {
    // refresh_ticket_tsv UPDATEs tickets and reads ticket_messages, both under
    // workspace_isolation. Unbound it matches zero rows, so message bodies
    // silently never become searchable.
    const workspaceId = requireWorkspace(job);
    await this.workspaces.runInWorkspace(workspaceId, async () => {
      try {
        await this.prisma.$executeRaw(
          Prisma.sql`SELECT refresh_ticket_tsv(${job.data.ticketId}::uuid)`,
        );
      } catch {
        // search_tsv extras not installed — harmless in dev
      }
    });
  }
}

// ---- notifications.fanout -------------------------------------------------------------

@Processor(QUEUES.NOTIFICATIONS_FANOUT)
export class NotificationsFanoutProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly realtime: RealtimeService,
    private readonly workspaces: WorkspaceContextService,
  ) {
    super();
  }

  async process(
    job: Job<{
      kind: string;
      userIds: string[];
      text: string;
      ticketId?: string;
      email?: boolean;
      workspaceId?: string;
    }>,
  ) {
    const { kind, userIds, text, ticketId, email } = job.data;

    // BEFORE requireWorkspace, deliberately. A password reset is enqueued from
    // an unauthenticated request that has no workspace bound, so it legitimately
    // arrives unstamped — and it needs no binding either: it reads `users` and
    // sends mail, and `users` carries no workspace_id so it is outside RLS.
    // Demanding a workspace here would break the one notification path that
    // currently works.
    if (kind === "password_reset") {
      // no in-app row; just the email (text carries the link)
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
      });
      for (const u of users)
        await this.email.sendNotification(
          u.email,
          "reset your plumo password",
          text,
        );
      return;
    }

    // Everything past this point writes `notifications`, which is workspace
    // scoped. Unbound, workspace_id defaults to app_current_workspace() = NULL
    // and the insert fails 23502 — loudly, but only after the job has retried to
    // exhaustion, so nobody sees it as the tenancy bug it is.
    const workspaceId = requireWorkspace(job);
    await this.workspaces.runInWorkspace(workspaceId, () =>
      this.prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          kind,
          text,
          ticketId: ticketId ?? null,
        })),
      }),
    );
    this.realtime.publish("notification.created", {
      workspaceId,
      userIds,
      kind,
      text,
      ticketId: ticketId ?? null,
    });

    if (email) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, isActive: true },
      });
      for (const u of users) {
        await this.email.sendNotification(
          u.email,
          `plumo — ${kind.replace("_", " ")}`,
          text,
        );
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
    private readonly workspaces: WorkspaceContextService,
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
    // ONE BOUND TRANSACTION PER WORKSPACE.
    //
    // The previous version enumerated workspaces correctly and then queried
    // without binding one — so every query ran on an unbound connection, RLS
    // filtered it to zero rows, and the job logged "nothing new since
    // watermark" every night while exporting nothing. It never errored; a
    // fail-closed policy produces silence, not a stack trace.
    //
    // forEachWorkspace opens a transaction, calls app_set_workspace, and runs
    // the body inside it — sequentially, so a nightly sweep cannot starve the
    // API of connections, and isolating failures so one desk cannot skip the
    // rest.
    await this.workspaces.forEachWorkspace(
      (workspaceId) => this.exportWorkspace(workspaceId),
      (workspaceId, err) =>
        this.logger.error(
          `Export failed for workspace ${workspaceId}: ${(err as Error).message}`,
        ),
    );
  }

  private async exportWorkspace(workspaceId: string) {
    const state = await this.prisma.exportState.findUnique({
      where: { workspaceId_id: { workspaceId, id: "daily" } },
    });
    const since = state?.watermark ?? new Date(0);

    const tickets = await this.prisma.ticket.findMany({
      where: { workspaceId, updatedAt: { gte: since } },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        channel: true,
        outcome: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        firstRespondedAt: true,
        tags: true,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 5_000,
    });
    if (tickets.length === 0) {
      this.logger.log("Export: nothing new since watermark");
      return;
    }

    const newWatermark = tickets[tickets.length - 1].updatedAt;
    this.emit(tickets);

    await this.prisma.exportState.upsert({
      where: { workspaceId_id: { workspaceId, id: "daily" } },
      create: {
        workspaceId,
        id: "daily",
        watermark: newWatermark,
        lastCount: tickets.length,
      },
      update: {
        watermark: newWatermark,
        lastCount: tickets.length,
        lastRunAt: new Date(),
      },
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
