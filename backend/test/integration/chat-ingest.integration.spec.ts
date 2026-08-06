import { PrismaService } from '../../src/prisma/prisma.service';
import { ChatService } from '../../src/chat/chat.module';
import { CustomersService } from '../../src/customers/customers.module';
import { TicketsService } from '../../src/tickets/tickets.service';
import { SlaService } from '../../src/sla/sla.service';
import { TeamScopeService } from '../../src/common/guards/team-scope.service';
import type { Principal } from '../../src/common/decorators';

/**
 * The chatbot ingest contract, against a real database.
 *
 * These assertions are about the properties a partner integration actually
 * depends on and that unit tests with a mocked Prisma cannot check: that the
 * idempotency constraints are real indexes rather than intentions, that one
 * chatbot cannot reach another's conversations, and that a bot answering
 * instantly does not start a human SLA clock.
 *
 * That last one is the live bug this whole design exists to avoid:
 * first_responded_at is stamped only for `user` actors, so a bot can never set
 * it. Left alone, every bot conversation sits in `new` with a null
 * first_responded_at — exactly the SLA sweep's candidate set — and breaches,
 * paging whichever agent round-robin had assigned at creation.
 */
describe('chatbot ingest', () => {
  const prisma = new PrismaService();
  const TAG = `chat-${process.pid}-${Math.floor(Math.random() * 1e6)}`;

  let chat: ChatService;
  let botA: Principal;
  let botB: Principal;
  let teamId: string;
  const noop = { write: jest.fn(), deliverWebhooks: jest.fn(), indexTicket: jest.fn(), notify: jest.fn(), publish: jest.fn(), sendEmail: jest.fn() };

  beforeAll(async () => {
    const team = await prisma.team.create({ data: { name: `${TAG}-team` } });
    teamId = team.id;
    const creator = await prisma.user.create({
      data: { name: `${TAG}-admin`, email: `${TAG}-admin@itest.invalid`, role: 'admin', passwordHash: 'x', teamId },
    });
    const mkKey = async (n: string) =>
      prisma.apiKey.create({
        data: {
          name: `${TAG}-${n}`, keyHash: `${TAG}-${n}-hash`, keyPrefix: `${TAG.slice(0, 8)}`,
          scopes: ['chat:write', 'chat:read'], teamId, createdById: creator.id,
        },
      });
    const a = await mkKey('botA');
    const b = await mkKey('botB');
    botA = { kind: 'api_key', id: a.id, scopes: a.scopes, teamId };
    botB = { kind: 'api_key', id: b.id, scopes: b.scopes, teamId };

    const customers = new CustomersService(prisma, noop as never);
    const sla = new SlaService(prisma);
    const tickets = new TicketsService(
      prisma, noop as never, noop as never, sla, customers, new TeamScopeService(prisma), noop as never,
    );
    chat = new ChatService(prisma, tickets, sla, customers, noop as never, noop as never, noop as never);
  });

  afterAll(async () => {
    await prisma.chatSession.deleteMany({ where: { sessionRef: { startsWith: TAG } } });
    await prisma.ticketMessage.deleteMany({ where: { ticket: { subject: { startsWith: TAG } } } });
    await prisma.ticket.deleteMany({ where: { subject: { startsWith: TAG } } });
    await prisma.customer.deleteMany({ where: { OR: [{ name: { startsWith: TAG } }, { visitorRef: { startsWith: TAG } }] } });
    await prisma.apiKey.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.team.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.$disconnect();
  });

  const open = (ref: string, actor = botA, extra: Record<string, unknown> = {}) =>
    chat.openConversation({ sessionRef: ref, subject: `${TAG} ${ref}`, ...extra } as never, actor);

  describe('idempotency', () => {
    it('re-opening the same session returns the same ticket, not a second one', async () => {
      const ref = `${TAG}-dup`;
      const first = await open(ref);
      const second = await open(ref);
      expect(second.ticketId).toBe(first.ticketId);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      const n = await prisma.chatSession.count({ where: { sessionRef: ref } });
      expect(n).toBe(1);
    });

    it('a retried turn does not duplicate the message', async () => {
      const ref = `${TAG}-turn`;
      await open(ref);
      const a = await chat.appendMessage(ref, { body: 'hello', author: 'visitor', externalRef: 'turn-1' } as never, botA);
      const b = await chat.appendMessage(ref, { body: 'hello', author: 'visitor', externalRef: 'turn-1' } as never, botA);
      expect(b.messageId).toBe(a.messageId);
      expect(b.duplicate).toBe(true);
    });

    it('the database, not the code, is what enforces session uniqueness', async () => {
      // If this constraint were only an application check it would fail open
      // under concurrency, which is exactly when a partner retries.
      const ref = `${TAG}-race`;
      const { ticketId } = await open(ref);
      await expect(
        prisma.chatSession.create({ data: { apiKeyId: botA.id, sessionRef: ref, ticketId } }),
      ).rejects.toThrow(/Unique constraint/i);
    });
  });

  describe('one chatbot cannot reach another chatbot', () => {
    it('refuses to read a session ref belonging to a different key', async () => {
      const ref = `${TAG}-private`;
      await open(ref, botA);
      // Same string, different chatbot: must look like it does not exist.
      await expect(chat.getConversation(ref, botB)).rejects.toThrow(/No such conversation/);
    });

    it('lets each chatbot use the same session ref independently', async () => {
      const ref = `${TAG}-shared-ref`;
      const a = await open(ref, botA);
      const b = await open(ref, botB);
      expect(a.ticketId).not.toBe(b.ticketId);
    });

    it('the updates cursor only ever returns a chatbot own conversations', async () => {
      const res = await chat.updates({ since: new Date(0).toISOString() } as never, botB);
      const mine = await prisma.chatSession.findMany({ where: { apiKeyId: botB.id }, select: { ticketId: true } });
      const allowed = new Set(mine.map((m) => m.ticketId));
      for (const u of res.updates) expect(allowed.has(u.ticketId)).toBe(true);
    });
  });

  describe('bot-first SLA semantics', () => {
    it('a bot conversation starts with no human clock and no assignee', async () => {
      const ref = `${TAG}-sla`;
      const { ticketId } = await open(ref);
      const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      // all three are what make the sweep skip it and stop the false breach
      expect(t.firstResponseDueAt).toBeNull();
      expect(t.resolutionDueAt).toBeNull();
      expect(t.assigneeId).toBeNull();
      expect(t.createdByApiKeyId).toBe(botA.id);
      expect(t.channel).toBe('chatbot');
    });

    it('a bot reply stamps bot_replied_at and never first_responded_at', async () => {
      const ref = `${TAG}-botreply`;
      const { ticketId } = await open(ref);
      await chat.appendMessage(ref, { body: 'I can help with that', author: 'bot' } as never, botA);
      const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      expect(t.botRepliedAt).not.toBeNull();
      expect(t.firstRespondedAt).toBeNull(); // the metric stays about humans
    });

    it('handoff is what starts the human clock', async () => {
      const ref = `${TAG}-handoff`;
      const { ticketId } = await open(ref);
      const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      expect(before.firstResponseDueAt).toBeNull();

      await chat.handoff(ref, { reason: 'out of scope', priority: 'high' } as never, botA);

      const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      expect(after.handedOffAt).not.toBeNull();
      expect(after.firstResponseDueAt).not.toBeNull();
      expect(after.priority).toBe('high');
      expect(after.outcome).toBe('escalated');
    });

    it('handoff twice is harmless', async () => {
      const ref = `${TAG}-handoff2`;
      await open(ref);
      await chat.handoff(ref, {} as never, botA);
      const second = await chat.handoff(ref, {} as never, botA);
      expect(second.alreadyHandedOff).toBe(true);
    });

    it('the bot cannot resolve a conversation a human has taken over', async () => {
      const ref = `${TAG}-taken`;
      await open(ref);
      await chat.handoff(ref, {} as never, botA);
      await expect(chat.resolve(ref, {} as never, botA)).rejects.toThrow(/human owns this/i);
    });
  });

  describe('anonymous visitors', () => {
    it('creates a customer with no email at all', async () => {
      const ref = `${TAG}-anon`;
      const { ticketId } = await open(ref, botA, { visitorRef: `${TAG}-v1` });
      const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { customer: true } });
      expect(t.customer.email).toBeNull();
      expect(t.customer.visitorRef).toBe(`${TAG}-v1`);
      expect(t.customer.visitorApiKeyId).toBe(botA.id);
    });

    it('the same visitor across two conversations is one customer', async () => {
      const v = `${TAG}-repeat`;
      const one = await open(`${TAG}-s1`, botA, { visitorRef: v });
      const two = await open(`${TAG}-s2`, botA, { visitorRef: v });
      const [a, b] = await Promise.all([
        prisma.ticket.findUniqueOrThrow({ where: { id: one.ticketId } }),
        prisma.ticket.findUniqueOrThrow({ where: { id: two.ticketId } }),
      ]);
      expect(a.customerId).toBe(b.customerId);
      expect(a.id).not.toBe(b.id); // two conversations, one person
    });

    it('a customer with neither an email nor a visitor identity is rejected by the database', async () => {
      // customers_identity_check — without it such a row is unfindable and
      // silently orphaned, which is how duplicate customers accumulate.
      await expect(
        prisma.customer.create({ data: { name: `${TAG}-nobody` } }),
      ).rejects.toThrow(/customers_identity_check|violates check constraint/i);
    });
  });

  describe('what the partner is given', () => {
    it('never exposes the ticket number', async () => {
      const ref = `${TAG}-nonum`;
      const opened = await open(ref);
      const convo = await chat.getConversation(ref, botA);
      // Numbers become per-workspace in the tenancy migration; a partner that
      // learned one would see it change underneath them.
      expect(JSON.stringify(opened)).not.toMatch(/"number"/);
      expect(JSON.stringify(convo)).not.toMatch(/"number"/);
      expect(opened.ticketId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('never leaks an internal note to the partner', async () => {
      const ref = `${TAG}-note`;
      const { ticketId } = await open(ref);
      await prisma.ticketMessage.create({
        data: { ticketId, authorType: 'agent', body: 'internal: customer is a known abuser', isInternalNote: true, channel: 'chatbot' },
      });
      const convo = await chat.getConversation(ref, botA);
      expect(JSON.stringify(convo)).not.toMatch(/known abuser/);
    });

    it('the updates cursor returns agent replies and excludes the bot own messages', async () => {
      const ref = `${TAG}-cursor`;
      const { ticketId } = await open(ref);
      const t0 = new Date();
      await chat.appendMessage(ref, { body: 'bot says hi', author: 'bot' } as never, botA);
      await prisma.ticketMessage.create({
        data: { ticketId, authorType: 'agent', body: 'agent says hi', isInternalNote: false, channel: 'chatbot' },
      });
      const res = await chat.updates({ since: t0.toISOString() } as never, botA);
      const bodies = res.updates.map((u) => u.body);
      expect(bodies).toContain('agent says hi');
      expect(bodies).not.toContain('bot says hi');
      expect(res.updates.find((u) => u.body === 'agent says hi')?.sessionRef).toBe(ref);
    });

    it('delivers a fresh reply but holds the cursor behind the present', async () => {
      const ref = `${TAG}-watermark`;
      const { ticketId } = await open(ref);
      const t0 = new Date();
      await prisma.ticketMessage.create({
        data: { ticketId, authorType: 'agent', body: 'just now', isInternalNote: false, channel: 'chatbot' },
      });

      const res = await chat.updates({ since: t0.toISOString() } as never, botA);

      // Delivered immediately — the safety margin must not add latency.
      expect(res.updates.map((u) => u.body)).toContain('just now');
      // ...but the cursor stays behind, so a transaction that started before
      // this poll and commits after it is still inside the next window. This
      // is the invariant that stops an agent reply vanishing for good.
      expect(new Date(res.cursor).getTime()).toBeLessThan(Date.now() - 1_000);
      // The row is therefore re-delivered next poll. That is intended: the
      // contract mandates dedupe on messageId.
      const again = await chat.updates({ since: res.cursor } as never, botA);
      expect(again.updates.map((u) => u.body)).toContain('just now');
    });

    it('never reports hasMore when the cursor did not move', async () => {
      const ref = `${TAG}-noloop`;
      const { ticketId } = await open(ref);
      const t0 = new Date();
      for (let i = 0; i < 3; i++) {
        await prisma.ticketMessage.create({
          data: { ticketId, authorType: 'agent', body: `r${i}`, isInternalNote: false, channel: 'chatbot' },
        });
      }
      // A full page of rows that are all newer than the watermark clamps the
      // cursor back to where it started. Answering hasMore:true there would
      // send a client that re-polls on hasMore into a tight loop on the same
      // page forever — so the clamp has to suppress it.
      const res = await chat.updates({ since: t0.toISOString(), limit: 3 } as never, botA);
      expect(res.updates).toHaveLength(3);
      expect(new Date(res.cursor).getTime()).toBeLessThanOrEqual(t0.getTime());
      expect(res.hasMore).toBe(false);
    });
  });
});
