import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Principal } from '../common/decorators';
import { CustomersService } from '../customers/customers.module';
import { cleanSubject, stripQuotedHistory, ticketNumberFromSubject } from './email-parsing.util';

/**
 * What an inbound-email webhook can post.
 *
 * Providers disagree about where the recipient is, so all the places it turns up
 * are accepted: SendGrid posts a JSON `envelope`, Mailgun a flat `recipient`,
 * Postmark `OriginalRecipient`, and an MTA piping a raw message may carry it
 * only in Delivered-To. Which of them WINS is decided in routeInbound, not here.
 */
export interface InboundEmailPayload {
  raw?: string;
  from?: string;
  name?: string;
  subject?: string;
  text?: string;
  messageId?: string;
  inReplyTo?: string;
  to?: string | string[];
  cc?: string | string[];
  envelope?: string | { to?: string | string[] };
  recipient?: string;
  originalRecipient?: string;
  deliveredTo?: string;
}

/** The desk an inbound message was routed to, and the address that decided it. */
export interface InboundRoute {
  workspaceId: string;
  workspaceSlug: string;
  address: string;
}

/**
 * Email pipeline (§11).
 * Outbound: templates rendered here, sent via SMTP; the ticket number goes in
 * the subject and Message-ID/References headers thread the conversation.
 * Inbound: route the message to a desk by its RECIPIENT address, then parse a
 * raw MIME message (from the inbound webhook), thread onto an existing ticket or
 * open a new one with channel = email.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
  ) {
    this.from = config.get<string>('smtp.from')!;
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('smtp.host') || 'localhost',
      port: config.get<number>('smtp.port') ?? 1025,
      secure: false,
      auth: config.get('smtp.user')
        ? { user: config.get<string>('smtp.user'), pass: config.get<string>('smtp.pass') }
        : undefined,
    });
  }

  /** Send a stored agent reply to the ticket's customer. */
  async sendTicketReply(ticketId: string, messageId: string) {
    const message = await this.prisma.ticketMessage.findUnique({
      where: { id: messageId },
      include: { ticket: { include: { customer: true } } },
    });
    if (!message || message.isInternalNote) return;
    const ticket = message.ticket;

    // An anonymous chat visitor has no address to reply to, and a chatbot
    // conversation is answered in the chat widget rather than by mail — sending
    // one would leak the exchange to whatever address the visitor later supplies
    // and would surprise a customer who never asked for email.
    if (!ticket.customer.email) {
      this.logger.debug(`ticket ${ticket.id}: customer has no email, skipping reply mail`);
      return;
    }
    if (ticket.channel === 'chatbot') {
      this.logger.debug(`ticket ${ticket.id}: chatbot channel, replies stay in chat`);
      return;
    }

    const emailMessageId = `<ticket-${ticket.number}-${message.id}@plumo.app>`;
    // References: the first inbound message id, if any, keeps the thread
    const first = await this.prisma.ticketMessage.findFirst({
      where: { ticketId, emailMessageId: { not: null } },
      orderBy: { createdAt: 'asc' },
    });

    await this.transporter.sendMail({
      from: this.from,
      to: ticket.customer.email,
      subject: `[Plumo #${ticket.number}] ${ticket.subject}`,
      text: message.body,
      html: this.renderReplyHtml(ticket.customer.name, message.body, Number(ticket.number)),
      messageId: emailMessageId,
      ...(first?.emailMessageId
        ? { inReplyTo: first.emailMessageId, references: [first.emailMessageId] }
        : {}),
    });

    await this.prisma.ticketMessage.update({
      where: { id: message.id },
      data: { emailMessageId },
    });
    this.logger.log(`Sent reply for #${ticket.number} to ${ticket.customer.email}`);
  }

  /** Send a plain notification email (assignments, SLA warnings, password reset). */
  async sendNotification(to: string, subject: string, body: string) {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text: body,
    });
  }

  /**
   * Invite somebody onto a desk.
   *
   * SENT SYNCHRONOUSLY, unlike every other outbound mail here, and unlike them it
   * is allowed to fail its caller. The notifications queue addresses recipients
   * by user id and writes a `notifications` row per recipient — a table whose FK
   * requires the recipient to already be a member of the workspace. An invitee is
   * by definition not one, so that path cannot carry this message at all. See the
   * note at the bottom of invitations.service.ts.
   *
   * `acceptUrl` is built by the caller from `consoleUrl` — the browser-facing
   * origin, NEVER `appUrl`, which in production is this api and serves no pages.
   * That mistake is why every password-reset link ever emailed 404'd, and an
   * invitation link that 404s is a tester who never arrives.
   *
   * Three facts, because an unexpected mail asking someone to create an account
   * is exactly the shape of a phishing message: WHO invited them, WHICH
   * organisation, and WHEN it stops working.
   */
  async sendInvitation(params: {
    to: string;
    workspaceName: string;
    inviterName: string;
    role: string;
    acceptUrl: string;
    expiresAt: Date;
  }) {
    const { to, workspaceName, inviterName, role, acceptUrl, expiresAt } = params;
    const expiresOn = expiresAt.toISOString().slice(0, 10);
    const subject = `${inviterName} invited you to ${workspaceName} on plumo`;

    const text = [
      `${inviterName} has invited you to join ${workspaceName} on Plumo CS as a ${role}.`,
      '',
      'Accept the invitation:',
      acceptUrl,
      '',
      `This link works once and expires on ${expiresOn} — seven days from when it was sent.`,
      '',
      'If you were not expecting this, you can ignore it. Nothing has been created in your name.',
    ].join('\n');

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html: this.renderInvitationHtml({ workspaceName, inviterName, role, acceptUrl, expiresOn }),
    });
    this.logger.log(`Invitation to "${workspaceName}" sent to ${to}`);
  }

  /**
   * Parse an inbound raw MIME message and thread it. Returns the affected
   * ticket id, or null when dropped (auto-responders).
   */
  async processInbound(input: { raw?: string; parsed?: { from?: string; name?: string; subject?: string; text?: string; messageId?: string; inReplyTo?: string } }) {
    let fromEmail: string | undefined;
    let fromName: string | undefined;
    let subject = '';
    let text = '';
    let emailMessageId: string | undefined;
    let inReplyTo: string | undefined;
    let autoSubmitted = false;

    if (input.raw) {
      const mail = await simpleParser(input.raw);
      fromEmail = mail.from?.value?.[0]?.address ?? undefined;
      fromName = mail.from?.value?.[0]?.name || undefined;
      subject = mail.subject ?? '';
      text = (mail.text ?? '').trim();
      emailMessageId = mail.messageId ?? undefined;
      inReplyTo = mail.inReplyTo ?? undefined;
      autoSubmitted = /auto-(submitted|replied)/i.test(String(mail.headers.get('auto-submitted') ?? ''));
    } else if (input.parsed) {
      fromEmail = input.parsed.from;
      fromName = input.parsed.name;
      subject = input.parsed.subject ?? '';
      text = (input.parsed.text ?? '').trim();
      emailMessageId = input.parsed.messageId;
      inReplyTo = input.parsed.inReplyTo;
    }

    if (!fromEmail || autoSubmitted) {
      this.logger.warn('Inbound email dropped (no sender or auto-responder)');
      return null;
    }
    text = stripQuotedHistory(text);

    // Threading: In-Reply-To / References → subject [Plumo #n] → new ticket.
    //
    // Both threading keys are tenant-ambiguous now: ticket numbers restart per
    // workspace, and email_message_id is only unique within one. So the tenant
    // has to come from the transaction binding rather than from anything in the
    // message — the From: line and the subject are unauthenticated, and matching
    // them globally would let a stranger steer a reply into another desk's
    // conversation. Resolving it here also keeps the lookups and the writes below
    // in the same workspace by construction, since workspace_id defaults to
    // exactly this value.
    const workspaceId = await this.boundWorkspaceId();

    let ticketId: string | null = null;
    if (inReplyTo) {
      const linked = await this.prisma.ticketMessage.findFirst({
        where: { workspaceId, emailMessageId: inReplyTo },
      });
      ticketId = linked?.ticketId ?? null;
    }
    if (!ticketId) {
      const num = ticketNumberFromSubject(subject);
      if (num != null) {
        // (workspace_id, number) is UNIQUE in the database but is not declared in
        // schema.prisma, so Prisma exposes no compound key to findUnique on.
        // findFirst over both columns is the same index scan with the same single
        // answer — what must not happen is dropping back to number alone.
        const t = await this.prisma.ticket.findFirst({
          where: { workspaceId, number: BigInt(num) },
        });
        ticketId = t?.id ?? null;
      }
    }

    const customer = await this.customers.findOrCreateByEmail(fromEmail, fromName);

    if (ticketId) {
      await this.prisma.$transaction([
        this.prisma.ticketMessage.create({
          data: {
            ticketId,
            authorType: 'customer',
            authorId: customer.id,
            body: text || '(empty message)',
            channel: 'email',
            emailMessageId: emailMessageId ?? null,
          },
        }),
        // a customer reply reopens the SLA conversation loop
        this.prisma.ticket.update({
          where: { id: ticketId },
          data: { updatedAt: new Date() },
        }),
      ]);
      return ticketId;
    }

    // new ticket
    const ticket = await this.prisma.ticket.create({
      data: {
        subject: cleanSubject(subject),
        channel: 'email',
        customerId: customer.id,
        companyId: customer.companyId,
        messages: {
          create: {
            authorType: 'customer',
            authorId: customer.id,
            body: text || '(empty message)',
            channel: 'email',
            emailMessageId: emailMessageId ?? null,
          },
        },
      },
    });
    this.logger.log(`Inbound email opened ticket #${ticket.number}`);
    return ticket.id;
  }

  // ---- inbound routing ---------------------------------------------------------

  /**
   * Which desk does this message belong to? Null means none, and null means
   * REFUSE it.
   *
   * A message from the outside world belongs to no workspace until its RECIPIENT
   * address says so. Nothing else in it can: the From: line, the subject's
   * `[Plumo #N]` and In-Reply-To are all attacker-controlled and all ambiguous
   * across tenants (ticket numbers restart per workspace, email_message_id is
   * only unique within one). The recipient is the single field the sender does
   * not choose, and `workspaces.inbound_email` is the mapping.
   *
   * THERE IS NO FALLBACK, deliberately. Guessing "the only workspace" worked
   * while there was one; there are two, and a wrong guess files a stranger's mail
   * into another customer's inbox and threads their reply into that desk's
   * conversation. An unmatched address is logged and the message is refused.
   */
  async routeInbound(payload: InboundEmailPayload): Promise<InboundRoute | null> {
    const { delivery, headers } = recipientsOf(payload);
    const seen = [...new Set([...delivery, ...headers])];
    if (seen.length === 0) {
      this.logger.warn(
        'Inbound email refused: no recipient address anywhere on the message ' +
          '(no envelope, Delivered-To, To or Cc)',
      );
      return null;
    }

    const desks = await this.desksByInboundAddress([...new Set([...seen, ...seen.map(baseAddress)])]);

    // THE DELIVERY PATH IS EXHAUSTED FIRST, all of it, before a single header is
    // consulted. It is ordered from most to least authoritative — the envelope
    // RCPT TO, then each Delivered-To hop as the message was forwarded — so the
    // first address that resolves is the answer rather than a coin flip. Letting
    // an exact To: match jump ahead of a `+tag` envelope match would hand the
    // sender back the choice of desk, which is the whole thing being prevented.
    for (const address of delivery) {
      // Exact before base: subaddressing (support+3f9a@) is how VERP and
      // per-thread aliases arrive, so the base address has to be honoured — but
      // never ahead of an explicitly configured `support+bugs@`, or that desk's
      // mail is quietly taken over by whoever owns `support@`.
      const desk = desks.get(address) ?? desks.get(baseAddress(address));
      if (desk) return this.acceptDesk(desk, address);
    }

    // To/Cc carry no delivery authority — the sender wrote them — so ordering
    // means nothing here. One desk named is a route; two desks named is a choice
    // between two paying customers, which is exactly the guess this whole
    // function exists to avoid.
    for (const form of [(a: string) => a, baseAddress]) {
      const named = new Map<string, { desk: InboundDesk; address: string }>();
      for (const address of headers) {
        const desk = desks.get(form(address));
        if (desk) named.set(desk.id, { desk, address });
      }
      if (named.size > 1) {
        this.logger.warn(
          `Inbound email refused: To/Cc names ${named.size} desks at once ` +
            `(${[...named.values()].map((n) => n.address).join(', ')}) — refusing rather than picking one`,
        );
        return null;
      }
      if (named.size === 1) {
        const [only] = [...named.values()];
        return this.acceptDesk(only.desk, only.address);
      }
    }

    this.logger.warn(
      `Inbound email refused: no workspace receives mail at ${seen.join(', ')}. ` +
        'Set the desk\'s address with PUT /email/inbound-address.',
    );
    return null;
  }

  /** A matched desk still has to be open for business. */
  private acceptDesk(desk: InboundDesk, address: string): InboundRoute | null {
    // Suspension is this product's offboarding path and it means read-only.
    // Opening a ticket is a write, and every other unattended path already skips
    // these desks (app_active_workspaces returns active only), so accepting mail
    // for one would be the single place a suspended tenant kept accruing data.
    if (desk.status !== 'active') {
      this.logger.warn(
        `Inbound email refused: ${address} belongs to workspace "${desk.slug}", which is ${desk.status}`,
      );
      return null;
    }
    return { workspaceId: desk.id, workspaceSlug: desk.slug, address };
  }

  /**
   * Look up desks by receiving address.
   *
   * Runs on an UNBOUND connection and has to: the webhook is @Public, so no
   * workspace is bound when this is called — that is the point, the tenant is
   * what we are trying to discover. It works because `workspaces` carries no
   * workspace_id and therefore has no workspace_isolation policy; the Phase-3
   * migration lists it under "NOT COVERED, on purpose" for the same reason the
   * single-workspace probe in WorkspaceContextService can read it.
   */
  private async desksByInboundAddress(addresses: string[]): Promise<Map<string, InboundDesk>> {
    if (addresses.length === 0) return new Map();

    // `::citext` ON THE PARAMETER, not just on the column. The extension makes
    // citext→text an IMPLICIT cast and text→citext only an ASSIGNMENT one, so
    // `inbound_email IN ($1)` with a text parameter resolves to text = text and
    // the match silently becomes case-SENSITIVE — the same trap the tenancy
    // migration documents on the slug regex. Mail addresses are matched
    // case-insensitively by every MTA alive; a capital letter must not decide
    // whether a customer's email is delivered.
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; slug: string; status: string; inboundEmail: string }>
    >(Prisma.sql`
      SELECT id                          AS "id",
             slug::text                  AS "slug",
             status::text                AS "status",
             lower(inbound_email::text)  AS "inboundEmail"
        FROM workspaces
       WHERE inbound_email IS NOT NULL
         AND inbound_email IN (${Prisma.join(addresses.map((a) => Prisma.sql`${a}::citext`))})
    `);
    return new Map(rows.map((r) => [r.inboundEmail, r]));
  }

  /**
   * Point a desk at a receiving address, or clear it.
   *
   * Without this the routing above has nothing to match: provisioning leaves
   * inbound_email NULL on purpose, so a desk refuses every inbound message until
   * somebody sets one here. This is the switch that turns the channel on.
   */
  async setInboundAddress(workspaceId: string, address: string | null, actor: Principal) {
    const normalized = address == null ? null : normalizeAddress(address);
    if (address != null && normalized === null) {
      throw new BadRequestException('Not a plain email address');
    }

    try {
      const desk = await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { inboundEmail: normalized },
        select: { slug: true, inboundEmail: true },
      });
      await this.audit.write({
        actor,
        entityType: 'workspace',
        entityId: workspaceId,
        action: 'set_inbound_email',
        diff: { inboundEmail: normalized },
      });
      this.logger.log(
        normalized
          ? `Workspace "${desk.slug}" now receives inbound mail at ${normalized}`
          : `Workspace "${desk.slug}" no longer receives inbound mail`,
      );
      return { inboundEmail: desk.inboundEmail };
    } catch (err) {
      // workspaces_inbound_email_key — one address, one desk, enforced by a
      // partial unique index rather than by schema.prisma, so Prisma has no
      // @unique to pre-check and this arrives as a raw constraint violation.
      // Left unhandled the admin gets a 500 and the one useful fact (somebody
      // already owns that address) stays in the server log.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Another workspace already receives mail at that address');
      }
      throw err;
    }
  }

  /** The desk's current receiving address, or null while the channel is off. */
  async getInboundAddress(workspaceId: string) {
    const desk = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { inboundEmail: true },
    });
    return { inboundEmail: desk?.inboundEmail ?? null };
  }

  /**
   * The workspace bound to the current transaction.
   *
   * Inbound email is the one write path with no Principal to read a workspace
   * off — the webhook is @Public and the work happens on a queue — so the tenant
   * is whatever the caller bound with WorkspaceContextService.runInWorkspace().
   * Reading the binding rather than taking a parameter is deliberate: this is the
   * same value every workspace_id column default resolves to, so a lookup here
   * can never disagree with the workspace the message is then written into.
   *
   * Unbound means the caller forgot to wrap, which is a bug in the caller and not
   * a bad email — hence a legible failure here instead of an unscoped read
   * followed by a not-null violation on the insert.
   */
  private async boundWorkspaceId(): Promise<string> {
    const [row] = await this.prisma.$queryRaw<Array<{ workspaceId: string | null }>>(
      Prisma.sql`SELECT app_current_workspace() AS "workspaceId"`,
    );
    if (!row?.workspaceId) {
      throw new Error(
        'Inbound email processed with no workspace bound. Wrap the call in ' +
          'WorkspaceContextService.runInWorkspace() so the tenant is resolved before threading.',
      );
    }
    return row.workspaceId;
  }

  /** Same typographic shell as renderReplyHtml, with one obvious button. */
  private renderInvitationHtml(p: {
    workspaceName: string;
    inviterName: string;
    role: string;
    acceptUrl: string;
    expiresOn: string;
  }): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // The URL is escaped for the attribute AND printed in full underneath: a mail
    // client that strips the anchor, or a reader who wants to see where a link
    // goes before clicking it, both still get there.
    const href = esc(p.acceptUrl).replace(/"/g, '&quot;');
    return `<!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;color:#0F172A;max-width:560px;margin:0 auto;padding:24px">
      <p style="margin:0 0 16px;line-height:1.6"><strong>${esc(p.inviterName)}</strong> has invited you to join <strong>${esc(p.workspaceName)}</strong> on Plumo CS as a ${esc(p.role)}.</p>
      <p style="margin:0 0 20px"><a href="${href}" style="display:inline-block;background:#0F172A;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Accept the invitation</a></p>
      <p style="margin:0 0 12px;font-size:12px;color:#64748B;word-break:break-all">${esc(p.acceptUrl)}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#64748B">This link works once and expires on ${esc(p.expiresOn)}.</p>
      <p style="margin:0;font-size:12px;color:#64748B">If you were not expecting this you can ignore it — nothing has been created in your name.</p>
    </body></html>`;
  }

  private renderReplyHtml(name: string, body: string, number: number): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const paras = esc(body)
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 12px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
    return `<!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;color:#0F172A;max-width:560px;margin:0 auto;padding:24px">
      ${paras}
      <p style="margin:20px 0 0;font-size:12px;color:#64748B">plumo support · conversation #${number} — just reply to this email to continue.</p>
    </body></html>`;
  }
}

// ---- recipient extraction ------------------------------------------------------
//
// Pure, and pure on purpose: routing decides which customer's desk a stranger's
// email lands in, so the rules have to be testable without a database or an MTA.

interface InboundDesk {
  id: string;
  slug: string;
  status: string;
}

/** Headers that name where the message was actually DELIVERED, most recent first. */
const DELIVERY_HEADERS = ['delivered-to', 'x-original-to', 'x-envelope-to', 'x-forwarded-to'];

/**
 * Every address the message was sent to, split into the two kinds.
 *
 * `delivery` is the envelope and the Delivered-To trail: what the MTA did with
 * the message, which the sender cannot dictate. `headers` is To and Cc: what the
 * sender typed, which may be an alias, a mailing list, or a lie. A real MTA
 * routinely delivers a message whose To: names nobody here at all — bcc, a
 * distribution list, a forward — so the delivery side has to exist or those
 * messages are unroutable.
 */
function recipientsOf(payload: InboundEmailPayload): { delivery: string[]; headers: string[] } {
  const delivery: string[] = [];
  const headers: string[] = [];

  // SendGrid posts `envelope` as a JSON *string*; others send an object.
  let envelope = payload.envelope;
  if (typeof envelope === 'string') {
    try {
      envelope = JSON.parse(envelope) as { to?: string | string[] };
    } catch {
      envelope = undefined; // a malformed envelope is not a reason to drop To/Cc
    }
  }
  delivery.push(...addressesIn(envelope?.to));
  delivery.push(...addressesIn(payload.recipient));
  delivery.push(...addressesIn(payload.originalRecipient));
  delivery.push(...addressesIn(payload.deliveredTo));

  if (payload.raw) {
    // Not simpleParser: routing needs four header fields, and mailparser walks
    // the whole MIME tree — decoding every attachment into a Buffer — to hand
    // them over. The worker still does the authoritative parse of the body.
    for (const [key, value] of headerPairs(payload.raw)) {
      if (DELIVERY_HEADERS.includes(key)) delivery.push(...addressesIn(value));
      else if (key === 'to' || key === 'cc') headers.push(...addressesIn(value));
    }
  }
  headers.push(...addressesIn(payload.to));
  headers.push(...addressesIn(payload.cc));

  return { delivery: [...new Set(delivery)], headers: [...new Set(headers)] };
}

/**
 * The header block of a raw message as (lowercased key, value) pairs, in order.
 *
 * Continuation lines are folded back in (RFC 5322 §2.2.3) — a long To: list
 * wraps, and reading only the first line would drop every address after the
 * wrap. Repeated keys are kept as separate pairs, because a forwarded message
 * accumulates one Delivered-To per hop and each is a routing candidate.
 */
function headerPairs(raw: string): Array<[string, string]> {
  const end = raw.search(/\r?\n\r?\n/);
  const block = end === -1 ? raw : raw.slice(0, end);
  const pairs: Array<[string, string]> = [];
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && pairs.length > 0) {
      pairs[pairs.length - 1][1] += ` ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon > 0) pairs.push([line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()]);
  }
  return pairs;
}

/** Pull addresses out of anything an address list can arrive as. */
function addressesIn(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(addressesIn);
  if (typeof value !== 'string') return [];

  const found: string[] = [];
  const rest = value
    // Angle-bracketed first: `"Support, Desk" <a@b>` has a comma in the display
    // name, so splitting on commas before this would invent two broken addresses.
    .replace(/<([^<>]*)>/g, (_m, address: string) => {
      found.push(address);
      return ' ';
    })
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ');
  for (const token of rest.split(/[\s,;]+/)) if (token.includes('@')) found.push(token);

  return found.map(normalizeAddress).filter((a): a is string => a !== null);
}

/** Trim, unwrap and lowercase one address; null if it is not one. */
function normalizeAddress(raw: string): string | null {
  const address = raw
    .trim()
    .replace(/^[<"']+/, '')
    .replace(/[>"',;.]+$/, '')
    .trim()
    .toLowerCase();
  // Deliberately loose — one @, no whitespace, something either side. The
  // authority on whether an address is ours is the workspaces lookup, and a
  // stricter pattern here would only ever reject a real address (no TLD in dev,
  // a quoted local part in the wild) and refuse a message that should be routed.
  return /^[^\s@]+@[^\s@]+$/.test(address) ? address : null;
}

/**
 * `support+3f9a@desk.example` → `support@desk.example`.
 *
 * Subaddressing is how VERP, per-thread aliases and "reply to this exact
 * conversation" addresses arrive. Only consulted after every exact match has
 * failed — see routeInbound.
 */
function baseAddress(address: string): string {
  const at = address.lastIndexOf('@');
  const plus = address.indexOf('+');
  return plus > 0 && plus < at ? address.slice(0, plus) + address.slice(at) : address;
}
