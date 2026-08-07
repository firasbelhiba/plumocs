import { ChatService } from '../../src/chat/chat.module';
import { CustomersService } from '../../src/customers/customers.module';
import { TicketsService } from '../../src/tickets/tickets.service';
import { SlaService } from '../../src/sla/sla.service';
import { TeamScopeService } from '../../src/common/guards/team-scope.service';
import { CURSOR_SAFETY_LAG_MS } from '../../src/chat/updates-cursor';
import { prisma, seedFixture, cleanup, inWorkspace, TAG, type Fixture } from './harness';
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
 *
 * ONE `request()` PER LOGICAL CALL, never one per test. That mirrors the
 * interceptor — a request is a transaction — and it is also required for the
 * cursor tests to mean anything: `created_at` defaults to CURRENT_TIMESTAMP,
 * which is frozen at transaction start, so several writes sharing one
 * transaction would share one timestamp and the watermark assertions would be
 * comparing a clock against itself.
 */
describe('chatbot ingest', () => {
  let f: Fixture;
  let chat: ChatService;
  let botA: Principal;
  let botB: Principal;
  const noop = { write: jest.fn(), deliverWebhooks: jest.fn(), indexTicket: jest.fn(), notify: jest.fn(), publish: jest.fn(), sendEmail: jest.fn() };

  /** One bound transaction, exactly as WorkspaceBindingInterceptor wraps a request. */
  const request = <T>(fn: () => Promise<T>) => inWorkspace(f.id, fn);

  beforeAll(async () => {
    f = await seedFixture();

    await request(async () => {
      // created_by is a composite FK to (workspace_id, user_id) on
      // workspace_memberships since tenancy, so the key's creator has to be
      // SEATED on this desk — a global user id is no longer referenceable.
      const mkKey = (n: string) =>
        prisma.apiKey.create({
          data: {
            name: `${TAG}-${n}`, keyHash: `${TAG}-${n}-hash`, keyPrefix: `${TAG.slice(0, 8)}`,
            scopes: ['chat:write', 'chat:read'], teamId: f.teamA, createdById: f.admin,
          },
        });
      const a = await mkKey('botA');
      const b = await mkKey('botB');
      botA = { kind: 'api_key', workspaceId: f.id, id: a.id, scopes: a.scopes, teamId: f.teamA };
      botB = { kind: 'api_key', workspaceId: f.id, id: b.id, scopes: b.scopes, teamId: f.teamA };
    });

    const customers = new CustomersService(prisma, noop as never);
    const sla = new SlaService(prisma);
    const tickets = new TicketsService(
      prisma, noop as never, noop as never, sla, customers, new TeamScopeService(prisma), noop as never,
    );
    chat = new ChatService(prisma, tickets, sla, customers, noop as never, noop as never, noop as never);
  });

  afterAll(cleanup);

  const open = (ref: string, actor = botA, extra: Record<string, unknown> = {}) =>
    request(() => chat.openConversation({ sessionRef: ref, subject: `${TAG} ${ref}`, ...extra } as never, actor));

  const loadTicket = (id: string) => request(() => prisma.ticket.findUniqueOrThrow({ where: { id } }));

  describe('idempotency', () => {
    it('re-opening the same session returns the same ticket, not a second one', async () => {
      const ref = `${TAG}-dup`;
      const first = await open(ref);
      const second = await open(ref);
      expect(second.ticketId).toBe(first.ticketId);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      const n = await request(() => prisma.chatSession.count({ where: { sessionRef: ref } }));
      expect(n).toBe(1);
    });

    it('a retried turn does not duplicate the message', async () => {
      const ref = `${TAG}-turn`;
      await open(ref);
      const a = await request(() =>
        chat.appendMessage(ref, { body: 'hello', author: 'visitor', externalRef: 'turn-1' } as never, botA));
      const b = await request(() =>
        chat.appendMessage(ref, { body: 'hello', author: 'visitor', externalRef: 'turn-1' } as never, botA));
      expect(b.messageId).toBe(a.messageId);
      expect(b.duplicate).toBe(true);
    });

    it('the database, not the code, is what enforces session uniqueness', async () => {
      // If this constraint were only an application check it would fail open
      // under concurrency, which is exactly when a partner retries.
      const ref = `${TAG}-race`;
      const { ticketId } = await open(ref);
      await expect(
        request(() => prisma.chatSession.create({ data: { apiKeyId: botA.id, sessionRef: ref, ticketId } })),
      ).rejects.toThrow(/Unique constraint/i);
    });
  });

  describe('one chatbot cannot reach another chatbot', () => {
    it('refuses to read a session ref belonging to a different key', async () => {
      const ref = `${TAG}-private`;
      await open(ref, botA);
      // Same string, different chatbot: must look like it does not exist.
      await expect(request(() => chat.getConversation(ref, botB))).rejects.toThrow(/No such conversation/);
    });

    it('lets each chatbot use the same session ref independently', async () => {
      const ref = `${TAG}-shared-ref`;
      const a = await open(ref, botA);
      const b = await open(ref, botB);
      expect(a.ticketId).not.toBe(b.ticketId);
    });

    it('the updates cursor only ever returns a chatbot own conversations', async () => {
      const res = await request(() => chat.updates({ since: new Date(0).toISOString() } as never, botB));
      const mine = await request(() =>
        prisma.chatSession.findMany({ where: { apiKeyId: botB.id }, select: { ticketId: true } }));
      const allowed = new Set(mine.map((m) => m.ticketId));
      for (const u of res.updates) expect(allowed.has(u.ticketId)).toBe(true);
    });
  });

  describe('bot-first SLA semantics', () => {
    it('a bot conversation starts with no human clock and no assignee', async () => {
      const ref = `${TAG}-sla`;
      const { ticketId } = await open(ref);
      const t = await loadTicket(ticketId);
      // all three are what make the sweep skip it and stop the false breach.
      // The desk DOES have SLA policies — the harness seeds the same four a real
      // one gets — so these nulls are the botHandled path, not an empty table.
      expect(t.firstResponseDueAt).toBeNull();
      expect(t.resolutionDueAt).toBeNull();
      expect(t.assigneeId).toBeNull();
      expect(t.createdByApiKeyId).toBe(botA.id);
      expect(t.channel).toBe('chatbot');
    });

    it('a bot reply stamps bot_replied_at and never first_responded_at', async () => {
      const ref = `${TAG}-botreply`;
      const { ticketId } = await open(ref);
      await request(() => chat.appendMessage(ref, { body: 'I can help with that', author: 'bot' } as never, botA));
      const t = await loadTicket(ticketId);
      expect(t.botRepliedAt).not.toBeNull();
      expect(t.firstRespondedAt).toBeNull(); // the metric stays about humans
    });

    it('handoff is what starts the human clock', async () => {
      const ref = `${TAG}-handoff`;
      const { ticketId } = await open(ref);
      const before = await loadTicket(ticketId);
      expect(before.firstResponseDueAt).toBeNull();

      await request(() => chat.handoff(ref, { reason: 'out of scope', priority: 'high' } as never, botA));

      const after = await loadTicket(ticketId);
      expect(after.handedOffAt).not.toBeNull();
      expect(after.firstResponseDueAt).not.toBeNull();
      expect(after.priority).toBe('high');
      expect(after.outcome).toBe('escalated');
    });

    it('handoff twice is harmless', async () => {
      const ref = `${TAG}-handoff2`;
      await open(ref);
      await request(() => chat.handoff(ref, {} as never, botA));
      const second = await request(() => chat.handoff(ref, {} as never, botA));
      expect(second.alreadyHandedOff).toBe(true);
    });

    it('the bot cannot resolve a conversation a human has taken over', async () => {
      const ref = `${TAG}-taken`;
      await open(ref);
      await request(() => chat.handoff(ref, {} as never, botA));
      await expect(request(() => chat.resolve(ref, {} as never, botA))).rejects.toThrow(/human owns this/i);
    });
  });

  describe('anonymous visitors', () => {
    it('creates a customer with no email at all', async () => {
      const ref = `${TAG}-anon`;
      const { ticketId } = await open(ref, botA, { visitorRef: `${TAG}-v1` });
      const t = await request(() =>
        prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { customer: true } }));
      expect(t.customer.email).toBeNull();
      expect(t.customer.visitorRef).toBe(`${TAG}-v1`);
      expect(t.customer.visitorApiKeyId).toBe(botA.id);
    });

    it('the same visitor across two conversations is one customer', async () => {
      const v = `${TAG}-repeat`;
      const one = await open(`${TAG}-s1`, botA, { visitorRef: v });
      const two = await open(`${TAG}-s2`, botA, { visitorRef: v });
      const [a, b] = await Promise.all([loadTicket(one.ticketId), loadTicket(two.ticketId)]);
      expect(a.customerId).toBe(b.customerId);
      expect(a.id).not.toBe(b.id); // two conversations, one person
    });

    it('a customer with neither an email nor a visitor identity is rejected by the database', async () => {
      // customers_identity_check — without it such a row is unfindable and
      // silently orphaned, which is how duplicate customers accumulate.
      //
      // Bound, and that is not incidental: unbound this insert fails first on the
      // workspace_id not-null, so the test would go green having never reached
      // the constraint it names.
      await expect(
        request(() => prisma.customer.create({ data: { name: `${TAG}-nobody` } })),
      ).rejects.toThrow(/customers_identity_check|violates check constraint/i);
    });
  });

  describe('what the partner is given', () => {
    it('never exposes the ticket number', async () => {
      const ref = `${TAG}-nonum`;
      const opened = await open(ref);
      const convo = await request(() => chat.getConversation(ref, botA));
      // Numbers are per-workspace now; a partner that had learned one would have
      // seen it change underneath them, which is why they are never returned.
      expect(JSON.stringify(opened)).not.toMatch(/"number"/);
      expect(JSON.stringify(convo)).not.toMatch(/"number"/);
      expect(opened.ticketId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('never leaks an internal note to the partner', async () => {
      const ref = `${TAG}-note`;
      const { ticketId } = await open(ref);
      await request(() =>
        prisma.ticketMessage.create({
          data: { ticketId, authorType: 'agent', body: 'internal: customer is a known abuser', isInternalNote: true, channel: 'chatbot' },
        }));
      const convo = await request(() => chat.getConversation(ref, botA));
      expect(JSON.stringify(convo)).not.toMatch(/known abuser/);
    });

    it('the updates cursor returns agent replies and excludes the bot own messages', async () => {
      const ref = `${TAG}-cursor`;
      const { ticketId } = await open(ref);
      const t0 = new Date();
      await request(() => chat.appendMessage(ref, { body: 'bot says hi', author: 'bot' } as never, botA));
      await request(() =>
        prisma.ticketMessage.create({
          data: { ticketId, authorType: 'agent', body: 'agent says hi', isInternalNote: false, channel: 'chatbot' },
        }));
      const res = await request(() => chat.updates({ since: t0.toISOString() } as never, botA));
      const bodies = res.updates.map((u) => u.body);
      expect(bodies).toContain('agent says hi');
      expect(bodies).not.toContain('bot says hi');
      expect(res.updates.find((u) => u.body === 'agent says hi')?.sessionRef).toBe(ref);
    });

    it('delivers a fresh reply and still re-delivers it on the next poll', async () => {
      const ref = `${TAG}-watermark`;
      const { ticketId } = await open(ref);
      const t0 = new Date();
      await request(() =>
        prisma.ticketMessage.create({
          data: { ticketId, authorType: 'agent', body: 'just now', isInternalNote: false, channel: 'chatbot' },
        }));

      const res = await request(() => chat.updates({ since: t0.toISOString() } as never, botA));

      // Delivered immediately — the safety margin must not add latency.
      expect(res.updates.map((u) => u.body)).toContain('just now');

      // WHAT THE CURSOR ACTUALLY GUARANTEES (see src/chat/updates-cursor.ts):
      //
      //   cursor = max(since, min(lastRow, now - CURSOR_SAFETY_LAG_MS))
      //
      // Two bounds, and this test used to assert only half of one of them —
      // "the cursor is at least a second behind now" — which is not a property
      // the function has. `since` here is a poll from a moment ago, so the FLOOR
      // wins: max() holds the cursor at `since`, roughly at the present, and it
      // is supposed to. The floor is what stops the cursor moving BACKWARDS,
      // which would walk a fast poller into re-reading an ever-growing window —
      // the whole history, every poll. The watermark clamp is asserted below,
      // where `since` is old enough for it to bite.
      const cursor = new Date(res.cursor).getTime();
      const watermark = Date.now() - CURSOR_SAFETY_LAG_MS;
      expect(cursor).toBeGreaterThanOrEqual(t0.getTime());
      expect(cursor).toBeLessThanOrEqual(Math.max(t0.getTime(), watermark));

      // The invariant this test exists for, and it holds either way: a row this
      // poll just saw is still inside the next window, so a transaction that
      // stamped before the poll and commits after it cannot fall through the
      // gap. Re-delivery is intended — the contract mandates dedupe on
      // messageId, and a duplicate is free where a loss is unrecoverable.
      const again = await request(() => chat.updates({ since: res.cursor } as never, botA));
      expect(again.updates.map((u) => u.body)).toContain('just now');
    });

    it('holds the cursor behind the present once since is older than the safety lag', async () => {
      // The other half: with `since` well behind the watermark the floor is
      // irrelevant and the clamp is the only thing deciding where the cursor
      // lands. Without this case "never exceeds the watermark" is never actually
      // exercised by an integration test — a function that ignored the clamp
      // entirely and returned `lastRow` would still pass the test above.
      const ref = `${TAG}-watermark-lag`;
      const { ticketId } = await open(ref);
      const since = new Date(Date.now() - 3600_000);
      await request(() =>
        prisma.ticketMessage.create({
          data: { ticketId, authorType: 'agent', body: 'moments ago', isInternalNote: false, channel: 'chatbot' },
        }));

      const res = await request(() => chat.updates({ since: since.toISOString() } as never, botA));
      expect(res.updates.map((u) => u.body)).toContain('moments ago');

      const cursor = new Date(res.cursor).getTime();
      // Strictly behind the present by the full lag, even though the newest row
      // is newer than that: the cursor follows the watermark, not the page.
      expect(cursor).toBeLessThanOrEqual(Date.now() - CURSOR_SAFETY_LAG_MS);
      // ...and it still advanced. A clamp that simply never moved would satisfy
      // the line above and stall the feed forever.
      expect(cursor).toBeGreaterThan(since.getTime());
      // The just-written row is newer than the watermark, so it is inside the
      // next window too — the same no-loss property, arrived at by the clamp
      // rather than by the floor.
      const again = await request(() => chat.updates({ since: res.cursor } as never, botA));
      expect(again.updates.map((u) => u.body)).toContain('moments ago');
    });

    it('never reports hasMore when the cursor did not move', async () => {
      const ref = `${TAG}-noloop`;
      const { ticketId } = await open(ref);
      const t0 = new Date();
      for (let i = 0; i < 3; i++) {
        await request(() =>
          prisma.ticketMessage.create({
            data: { ticketId, authorType: 'agent', body: `r${i}`, isInternalNote: false, channel: 'chatbot' },
          }));
      }
      // A full page of rows that are all newer than the watermark clamps the
      // cursor back to where it started. Answering hasMore:true there would
      // send a client that re-polls on hasMore into a tight loop on the same
      // page forever — so the clamp has to suppress it.
      const res = await request(() => chat.updates({ since: t0.toISOString(), limit: 3 } as never, botA));
      expect(res.updates).toHaveLength(3);
      expect(new Date(res.cursor).getTime()).toBeLessThanOrEqual(t0.getTime());
      expect(res.hasMore).toBe(false);
    });
  });
});
