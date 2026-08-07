import { EmailInboundProcessor, EmailOutboundProcessor, SearchIndexProcessor } from './processors';

/**
 * Do background jobs bind a workspace before touching tenant data?
 *
 * A JOB HAS NO REQUEST. Nothing binds a workspace, so under row-level security
 * an unbound processor reads zero rows and writes nothing — and reports success.
 * That is not a hypothetical: agent replies to customers stopped being sent at
 * the tenancy cutover and nobody noticed, because sendTicketReply looked up its
 * message, RLS hid it, and a bare `return` made "invisible" indistinguishable
 * from "nothing to do".
 *
 * The contract these cases pin down is therefore not "it works" but "it refuses
 * to run blind". A job with no workspaceId must THROW, so it lands in the failed
 * set where somebody can see it, rather than evaporating with a green tick.
 */
describe('worker jobs bind a workspace', () => {
  const job = (data: Record<string, unknown>) =>
    ({ data, queueName: 'email.outbound', name: 'send' }) as never;

  it('refuses to send a reply when the job carries no workspace', async () => {
    const email = { sendTicketReply: jest.fn() };
    const workspaces = { runInWorkspace: jest.fn() };
    const proc = new EmailOutboundProcessor(email as never, workspaces as never);

    await expect(proc.process(job({ ticketId: 't1', messageId: 'm1' }))).rejects.toThrow(
      /carries no workspaceId/,
    );

    // The point of throwing: it must not reach the send path and half-succeed.
    expect(email.sendTicketReply).not.toHaveBeenCalled();
    expect(workspaces.runInWorkspace).not.toHaveBeenCalled();
  });

  it('sends inside the bound workspace when it does', async () => {
    const email = { sendTicketReply: jest.fn().mockResolvedValue(undefined) };
    const workspaces = { runInWorkspace: jest.fn((_ws: string, fn: () => unknown) => fn()) };
    const proc = new EmailOutboundProcessor(email as never, workspaces as never);

    await proc.process(job({ ticketId: 't1', messageId: 'm1', workspaceId: 'ws-1' }));

    expect(workspaces.runInWorkspace).toHaveBeenCalledWith('ws-1', expect.any(Function));
    expect(email.sendTicketReply).toHaveBeenCalledWith('t1', 'm1');
  });

  it('applies the same rule to the search indexer', async () => {
    // refresh_ticket_tsv UPDATEs tickets and reads ticket_messages. Unbound it
    // matches nothing, so message bodies silently never become searchable —
    // the same shape of failure, in a place nobody would think to check.
    const prisma = { $executeRaw: jest.fn() };
    const workspaces = { runInWorkspace: jest.fn((_ws: string, fn: () => unknown) => fn()) };
    const proc = new SearchIndexProcessor(prisma as never, workspaces as never);

    await expect(
      proc.process({ data: { ticketId: 't1' }, queueName: 'search.index', name: 'index' } as never),
    ).rejects.toThrow(/carries no workspaceId/);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  // Inbound email now IS routed: the webhook matches the recipient against
  // workspaces.inbound_email and stamps the desk on the job, so a normal message
  // reaches this processor already bound and a message matching no desk is
  // refused at the door instead of enqueued.
  //
  // This case therefore no longer pins "every inbound email fails" — it pins the
  // backstop. Jobs enqueued before routing landed carry no workspaceId, and so
  // would anything a future producer forgets to stamp. Either way the answer
  // must stay refusal: with two desks live, guessing the sole workspace files a
  // stranger's email into another customer's inbox and threads their reply into
  // that desk's conversation.
  it('refuses an inbound email that names no workspace, rather than guessing one', async () => {
    const email = { processInbound: jest.fn() };
    const workspaces = { runInWorkspace: jest.fn() };
    const realtime = { publish: jest.fn() };
    const proc = new EmailInboundProcessor(
      email as never,
      { indexTicket: jest.fn() } as never,
      realtime as never,
      { ticket: { findUnique: jest.fn() } } as never,
      workspaces as never,
    );

    await expect(
      proc.process({ data: { raw: 'From: a@b.c' }, queueName: 'email.inbound', name: 'parse' } as never),
    ).rejects.toThrow(/carries no workspaceId/);

    // Nothing may be parsed, stored or announced on an unbound run.
    expect(email.processInbound).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it('parses and announces inside the binding when the workspace is known', async () => {
    // The lookup of teamId/assigneeId has to happen INSIDE the binding too:
    // unbound it returns null under RLS, and the event would then route to the
    // admin+lead room instead of the team that owns the ticket.
    const order: string[] = [];
    const email = {
      processInbound: jest.fn(() => {
        order.push('parse');
        return Promise.resolve('t9');
      }),
    };
    const prisma = {
      ticket: {
        findUnique: jest.fn(() => {
          order.push('lookup');
          return Promise.resolve({ teamId: 'team-7', assigneeId: null });
        }),
      },
    };
    const realtime = { publish: jest.fn() };
    const workspaces = {
      runInWorkspace: jest.fn((_ws: string, fn: () => unknown) => {
        order.push('bind');
        return fn();
      }),
    };
    const proc = new EmailInboundProcessor(
      email as never,
      { indexTicket: jest.fn() } as never,
      realtime as never,
      prisma as never,
      workspaces as never,
    );

    await proc.process({
      data: { raw: 'From: a@b.c', workspaceId: 'ws-1' },
      queueName: 'email.inbound',
      name: 'parse',
    } as never);

    expect(order).toEqual(['bind', 'parse', 'lookup']);
    expect(realtime.publish).toHaveBeenCalledWith(
      'message.added',
      expect.objectContaining({ workspaceId: 'ws-1', ticketId: 't9', teamId: 'team-7' }),
    );
  });
});
