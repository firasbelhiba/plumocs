import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.module';
import { cleanSubject, stripQuotedHistory, ticketNumberFromSubject } from './email-parsing.util';

/**
 * Email pipeline (§11).
 * Outbound: templates rendered here, sent via SMTP; the ticket number goes in
 * the subject and Message-ID/References headers thread the conversation.
 * Inbound: parse a raw MIME message (from the inbound webhook), thread onto an
 * existing ticket or open a new one with channel = email.
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

    // Threading: In-Reply-To / References → subject [Plumo #n] → new ticket
    let ticketId: string | null = null;
    if (inReplyTo) {
      const linked = await this.prisma.ticketMessage.findFirst({ where: { emailMessageId: inReplyTo } });
      ticketId = linked?.ticketId ?? null;
    }
    if (!ticketId) {
      const num = ticketNumberFromSubject(subject);
      if (num != null) {
        const t = await this.prisma.ticket.findUnique({ where: { number: BigInt(num) } });
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
        organizationId: customer.organizationId,
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
