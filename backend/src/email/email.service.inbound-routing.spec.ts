import { Logger, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';

/**
 * Which desk does a stranger's email land in?
 *
 * This is the isolation question the email channel could not answer, which is
 * why it was switched off: nothing mapped a recipient address to a workspace, so
 * every inbound job was enqueued unscoped and died at requireWorkspace. The fix
 * is a mapping (workspaces.inbound_email), and the rule these cases pin down is
 * that the mapping is the ONLY thing allowed to decide.
 *
 * The dangerous failure is not "the mail bounces". It is a message quietly filed
 * into the wrong customer's inbox — a From: line, a subject and a To: header are
 * all written by the sender, so any of them used as a routing key hands an
 * outsider the choice of whose desk to write to. Hence: refuse on no match,
 * refuse on an ambiguous match, and let the delivery path outrank the headers.
 */

const DESKS = [
  { id: 'ws-dar', slug: 'dar-blockchain', status: 'active', inboundEmail: 'support@dar.example' },
  { id: 'ws-firas', slug: 'firas2workspace', status: 'active', inboundEmail: 'help@firas.example' },
  { id: 'ws-bugs', slug: 'dar-blockchain', status: 'active', inboundEmail: 'support+bugs@dar.example' },
  { id: 'ws-gone', slug: 'closed-desk', status: 'suspended', inboundEmail: 'support@closed.example' },
];

function build(desks = DESKS) {
  const prisma = {
    // Stands in for the workspaces lookup: the parameters are the candidate
    // addresses, already lowercased, exactly as the SQL sends them.
    $queryRaw: jest.fn((sql: { values: unknown[] }) =>
      Promise.resolve(desks.filter((d) => sql.values.map(String).includes(d.inboundEmail))),
    ),
    workspace: { update: jest.fn(), findUnique: jest.fn() },
  };
  const audit = { write: jest.fn() };
  const service = new EmailService(
    { get: jest.fn() } as never,
    prisma as never,
    { findOrCreateByEmail: jest.fn() } as never,
    audit as never,
  );
  return { service, prisma, audit };
}

describe('inbound email routing', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('routes on the envelope recipient, which the sender cannot choose', async () => {
    const { service } = build();
    const route = await service.routeInbound({
      envelope: JSON.stringify({ to: ['support@dar.example'], from: 'ines@northwind.example' }),
      from: 'ines@northwind.example',
    });
    expect(route).toEqual({ workspaceId: 'ws-dar', workspaceSlug: 'dar-blockchain', address: 'support@dar.example' });
  });

  it('reads an envelope sent as an object rather than a JSON string', async () => {
    const { service } = build();
    const route = await service.routeInbound({ envelope: { to: 'help@firas.example' } });
    expect(route?.workspaceId).toBe('ws-firas');
  });

  // THE ISOLATION CASE. The To: line says one desk, the MTA delivered to
  // another. Believing the header lets an outsider address mail to whichever
  // customer they like by typing their name in To:.
  it('believes the delivery path over a To: header naming another desk', async () => {
    const { service } = build();
    const route = await service.routeInbound({
      envelope: { to: 'help@firas.example' },
      to: 'Support <support@dar.example>',
    });
    expect(route?.workspaceId).toBe('ws-firas');
  });

  it('falls back to Delivered-To when To: names only an alias', async () => {
    const { service } = build();
    const raw = [
      'Delivered-To: help@firas.example',
      'From: Ines <ines@northwind.example>',
      'To: all-support@aliases.example',
      'Subject: widget is spinning',
      '',
      'it spins forever.',
    ].join('\r\n');
    const route = await service.routeInbound({ raw });
    expect(route?.workspaceId).toBe('ws-firas');
  });

  it('matches without regard to case, as every MTA alive does', async () => {
    const { service } = build();
    const route = await service.routeInbound({ to: '"Dar Support" <SuPPort@DAR.Example>' });
    expect(route?.workspaceId).toBe('ws-dar');
  });

  it('routes on Cc when the desk was only copied', async () => {
    const { service } = build();
    const route = await service.routeInbound({
      to: 'ines@northwind.example',
      cc: 'support@dar.example',
    });
    expect(route?.workspaceId).toBe('ws-dar');
  });

  // Two desks in the headers is a choice between two paying customers. There is
  // no ordering authority in To:/Cc: — the sender typed them — so picking one is
  // a coin flip with somebody else's mail.
  it('refuses when To/Cc names two different desks', async () => {
    const { service } = build();
    const route = await service.routeInbound({
      to: 'support@dar.example',
      cc: 'help@firas.example',
    });
    expect(route).toBeNull();
  });

  it('refuses an address no desk receives, and names it in the log', async () => {
    const { service } = build();
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const route = await service.routeInbound({ to: 'sales@somewhere.example' });
    expect(route).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sales@somewhere.example'));
  });

  // The regression this whole feature exists to avoid: with one desk configured
  // it is very tempting to hand it everything that arrives. Two desks are live.
  it('refuses rather than falling back to the only desk there is', async () => {
    const { service } = build([DESKS[0]]);
    expect(await service.routeInbound({ to: 'anything@elsewhere.example' })).toBeNull();
  });

  it('refuses a message carrying no recipient at all', async () => {
    const { service, prisma } = build();
    expect(await service.routeInbound({ from: 'ines@northwind.example', text: 'hi' })).toBeNull();
    // and does not go to the database to find that out
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuses mail for a suspended desk instead of writing into it', async () => {
    const { service } = build();
    const warn = jest.spyOn(Logger.prototype, 'warn');
    expect(await service.routeInbound({ envelope: { to: 'support@closed.example' } })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('suspended'));
  });

  it('accepts a +tag subaddress on behalf of the desk owning the base address', async () => {
    const { service } = build();
    const route = await service.routeInbound({ envelope: { to: 'support+3f9a21@dar.example' } });
    expect(route?.workspaceId).toBe('ws-dar');
  });

  // An explicitly configured support+bugs@ must not be swallowed by whoever owns
  // support@ — exact matches are exhausted before any address is plus-stripped.
  it('prefers an exactly configured +tag address over the base address', async () => {
    const { service } = build();
    const route = await service.routeInbound({ envelope: { to: 'support+bugs@dar.example' } });
    expect(route?.workspaceId).toBe('ws-bugs');
  });

  // The delivery path has to be exhausted BEFORE any header is read, subaddress
  // matches included. Otherwise the sender gets the choice of desk back simply
  // by typing a rival's address in To:.
  it('prefers a +tag envelope match over an exact To: match on another desk', async () => {
    const { service } = build();
    const route = await service.routeInbound({
      envelope: { to: 'support+3f9a21@dar.example' },
      to: 'help@firas.example',
    });
    expect(route?.workspaceId).toBe('ws-dar');
  });

  it('is not fooled by a comma inside a quoted display name', async () => {
    const { service } = build();
    const route = await service.routeInbound({ to: '"Support, Desk" <support@dar.example>' });
    expect(route?.workspaceId).toBe('ws-dar');
  });

  // A long recipient list wraps. Reading only the first line drops every address
  // after the fold, which is how a legitimate message becomes unroutable.
  it('unfolds a wrapped recipient header', async () => {
    const { service } = build();
    const raw = [
      'From: ines@northwind.example',
      'To: one@elsewhere.example,',
      '\ttwo@elsewhere.example,',
      '\tsupport@dar.example',
      '',
      'body',
    ].join('\r\n');
    expect((await service.routeInbound({ raw }))?.workspaceId).toBe('ws-dar');
  });

  it('reads Mailgun-style recipient and Postmark-style originalRecipient', async () => {
    const { service } = build();
    expect((await service.routeInbound({ recipient: 'support@dar.example' }))?.workspaceId).toBe('ws-dar');
    expect((await service.routeInbound({ originalRecipient: 'help@firas.example' }))?.workspaceId).toBe('ws-firas');
  });

  it('ignores a malformed envelope rather than dropping the message', async () => {
    const { service } = build();
    const route = await service.routeInbound({ envelope: '{not json', to: 'support@dar.example' });
    expect(route?.workspaceId).toBe('ws-dar');
  });
});

describe('setting a desk inbound address', () => {
  const admin = { kind: 'user' as const, id: 'u1', workspaceId: 'ws-dar', role: 'admin' as const };

  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('writes the caller own workspace, never one named in the request', async () => {
    const { service, prisma, audit } = build();
    prisma.workspace.update.mockResolvedValue({ slug: 'dar-blockchain', inboundEmail: 'support@dar.example' });

    await service.setInboundAddress(admin.workspaceId, 'Support@Dar.Example', admin);

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-dar' },
        data: { inboundEmail: 'support@dar.example' }, // normalised on the way in
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'set_inbound_email' }));
  });

  it('switches the channel back off with null', async () => {
    const { service, prisma } = build();
    prisma.workspace.update.mockResolvedValue({ slug: 'dar-blockchain', inboundEmail: null });
    await service.setInboundAddress('ws-dar', null, admin);
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { inboundEmail: null } }),
    );
  });

  // workspaces_inbound_email_key is a partial unique index that schema.prisma
  // does not declare, so this arrives as a raw constraint violation rather than
  // a Prisma-side check. Unhandled it is a 500 that tells the admin nothing.
  it('reports the clash when another desk already owns the address', async () => {
    const { service, prisma } = build();
    prisma.workspace.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5' }),
    );
    await expect(service.setInboundAddress('ws-dar', 'help@firas.example', admin)).rejects.toThrow(
      /already receives mail/,
    );
  });

  it('rejects anything that is not a bare address', async () => {
    const { service } = build();
    await expect(service.setInboundAddress('ws-dar', 'Support Desk <a@b.example>', admin)).rejects.toThrow(
      /not a plain email address/i,
    );
  });
});

describe('the inbound webhook', () => {
  const SECRET = 'shared-inbound-secret';

  function controller(route: unknown) {
    const queue = { parseInboundEmail: jest.fn() };
    const email = { routeInbound: jest.fn().mockResolvedValue(route) };
    const config = { get: jest.fn().mockReturnValue(SECRET) };
    return { ctrl: new EmailController(config as never, queue as never, email as never), queue, email };
  }

  it('stamps the routed workspace on the job so the worker can bind it', async () => {
    const { ctrl, queue } = controller({ workspaceId: 'ws-dar', workspaceSlug: 'dar-blockchain', address: 'support@dar.example' });

    await ctrl.inbound(SECRET, { raw: 'From: ines@northwind.example\r\n\r\nhello' });

    expect(queue.parseInboundEmail).toHaveBeenCalledWith(
      { raw: 'From: ines@northwind.example\r\n\r\nhello' },
      'ws-dar',
    );
  });

  // Refusing at the door, not at the worker: an accepted-then-dropped message is
  // invisible to the sender, and the provider is the only party that can bounce
  // it back to a human.
  it('refuses an unroutable message instead of enqueuing a job that must fail', async () => {
    const { ctrl, queue } = controller(null);

    await expect(ctrl.inbound(SECRET, { to: 'sales@somewhere.example' })).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(queue.parseInboundEmail).not.toHaveBeenCalled();
  });

  it('rejects a bad secret before it looks at the message', async () => {
    const { ctrl, email } = controller(null);
    await expect(ctrl.inbound('wrong', { to: 'support@dar.example' })).rejects.toThrow(UnauthorizedException);
    await expect(ctrl.inbound(undefined, { to: 'support@dar.example' })).rejects.toThrow(UnauthorizedException);
    expect(email.routeInbound).not.toHaveBeenCalled();
  });
});
