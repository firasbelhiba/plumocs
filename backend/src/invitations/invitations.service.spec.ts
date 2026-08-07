import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { InvitationsService } from './invitations.service';

// argon2 is deliberately slow. Nothing here is testing the KDF, and a real hash
// per test buys a second of CI for no assertion.
jest.mock('argon2', () => ({ hash: jest.fn().mockResolvedValue('argon2$hash') }));

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const TOKEN = 'a'.repeat(64); // the shape resolveToken accepts: 32 bytes as hex

const CONSOLE = 'https://cs.plumo.work';
const WS = { id: 'ws-1', slug: 'northwind', name: 'Northwind' };
const ADMIN = { kind: 'user' as const, id: 'admin-1', workspaceId: WS.id, role: 'admin' as const, teamId: null };

const IN_A_WEEK = new Date(Date.now() + 7 * 86_400_000);
const LAST_WEEK = new Date(Date.now() - 7 * 86_400_000);

interface FakeUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  passwordHash: string;
}

/**
 * The resolved-invitation row app_resolve_invitation returns. Built here rather
 * than by a query, because the SECURITY DEFINER function is the one part of this
 * feature a unit test genuinely cannot exercise — it needs a real database with
 * real policies, which is the integration suite's job.
 */
function resolved(over: Partial<Record<string, unknown>> = {}) {
  return {
    invitationId: 'inv-1',
    workspaceId: WS.id,
    workspaceSlug: WS.slug,
    workspaceName: WS.name,
    workspaceActive: true,
    email: 'tester@example.com',
    role: 'agent',
    teamId: null,
    invitedById: ADMIN.id,
    expiresAt: IN_A_WEEK,
    acceptedAt: null,
    revokedAt: null,
    ...over,
  };
}

function build(opts: {
  users?: FakeUser[];
  membership?: { isActive: boolean } | null;
  resolvedRow?: Record<string, unknown> | null;
  team?: { id: string } | null;
  claimCount?: number;
  sendFails?: boolean;
} = {}) {
  const users: FakeUser[] = opts.users ?? [
    { id: ADMIN.id, email: 'admin@example.com', name: 'Ada', isActive: true, passwordHash: 'x' },
  ];

  const prisma: Record<string, any> = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.email) {
          return users.find((u) => u.email.toLowerCase() === String(where.email).toLowerCase()) ?? null;
        }
        return users.find((u) => u.id === where.id) ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        users.filter((u) => (where?.id?.in ?? []).includes(u.id)),
      ),
      create: jest.fn(async ({ data }: any) => {
        const created = { id: 'user-new', isActive: true, ...data };
        users.push(created);
        return created;
      }),
      update: jest.fn(async () => ({})),
    },
    team: { findFirst: jest.fn(async () => (opts.team === undefined ? { id: 'team-1' } : opts.team)) },
    workspace: { findUnique: jest.fn(async () => ({ name: WS.name, slug: WS.slug })) },
    workspaceMembership: {
      findUnique: jest.fn(async () => opts.membership ?? null),
      create: jest.fn(async () => ({ id: 'm-1' })),
      update: jest.fn(async () => ({ id: 'm-1' })),
    },
    invitation: {
      create: jest.fn(async ({ data }: any) => ({
        id: 'inv-1',
        email: data.email,
        role: data.role,
        expiresAt: data.expiresAt,
      })),
      updateMany: jest.fn(async () => ({ count: opts.claimCount ?? 1 })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    auditLog: { create: jest.fn(async () => ({})) },
    refreshToken: {
      create: jest.fn(async () => ({ id: 'rt-1' })),
      update: jest.fn(async () => ({})),
    },
    $queryRaw: jest.fn(async () => {
      const row = opts.resolvedRow === undefined ? resolved() : opts.resolvedRow;
      return row ? [row] : [];
    }),
    $executeRaw: jest.fn(async () => 1),
  };
  // The transaction client is the same object, which is what PrismaService's
  // proxy arranges at runtime: inside $transaction every `this.prisma.*` is
  // routed to the transaction.
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));

  const config = { get: jest.fn((k: string) => (k === 'consoleUrl' ? CONSOLE : undefined)) };
  const jwt = { signAsync: jest.fn(async () => 'signed.jwt.value') };
  // The parameters are declared (and ignored) so `mock.calls[0][0]` is typed as
  // the argument rather than as an element of an empty tuple.
  const audit = { write: jest.fn(async (_params: any) => undefined) };
  const email = {
    sendInvitation: jest.fn(async (_params: any) => {
      if (opts.sendFails) throw new Error('SMTP said no');
    }),
  };
  const workspaces = {
    runInWorkspace: jest.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    resolveForUser: jest.fn(async () => ({
      workspaceId: WS.id,
      workspaceSlug: WS.slug,
      role: 'agent',
      teamId: null,
    })),
  };

  const service = new InvitationsService(
    prisma as never,
    config as never,
    jwt as never,
    audit as never,
    email as never,
    workspaces as never,
  );
  return { service, prisma, audit, email, workspaces, users };
}

describe('InvitationsService.create', () => {
  const DTO = { email: 'Tester@Example.com', role: 'agent' as const };

  it('stores only a hash, and emails a link to the CONSOLE that matches it', async () => {
    const { service, prisma, email } = build();

    await service.create(DTO, ADMIN);

    const stored = prisma.invitation.create.mock.calls[0][0].data.tokenHash;
    const { acceptUrl } = email.sendInvitation.mock.calls[0][0];
    // consoleUrl, never appUrl: appUrl is this api and serves no pages, which is
    // why every emailed password-reset link 404'd for months.
    expect(acceptUrl.startsWith(`${CONSOLE}/accept-invite?token=`)).toBe(true);

    const emailedToken = acceptUrl.split('token=')[1];
    expect(emailedToken).toHaveLength(64);
    // The plaintext leaves in the mail and nowhere else.
    expect(stored).toBe(sha256(emailedToken));
    expect(stored).not.toBe(emailedToken);
  });

  it('normalises the address, so Tester@ and tester@ are one person', async () => {
    const { service, prisma } = build();
    await service.create(DTO, ADMIN);
    expect(prisma.invitation.create.mock.calls[0][0].data.email).toBe('tester@example.com');
  });

  it('refuses somebody who is already an active member, and sends nothing', async () => {
    const { service, prisma, email } = build({
      users: [
        { id: ADMIN.id, email: 'admin@example.com', name: 'Ada', isActive: true, passwordHash: 'x' },
        { id: 'u-2', email: 'tester@example.com', name: 'Bo', isActive: true, passwordHash: 'x' },
      ],
      membership: { isActive: true },
    });

    // An error, not a no-op: succeeding silently tells an admin their colleague
    // was invited when nothing was sent, and they wait for a mail that is never
    // coming.
    await expect(service.create(DTO, ADMIN)).rejects.toThrow(ConflictException);
    expect(prisma.invitation.create).not.toHaveBeenCalled();
    expect(email.sendInvitation).not.toHaveBeenCalled();
  });

  it('allows re-inviting somebody who was offboarded', async () => {
    const { service, prisma } = build({
      users: [
        { id: ADMIN.id, email: 'admin@example.com', name: 'Ada', isActive: true, passwordHash: 'x' },
        { id: 'u-2', email: 'tester@example.com', name: 'Bo', isActive: true, passwordHash: 'x' },
      ],
      membership: { isActive: false },
    });

    await expect(service.create(DTO, ADMIN)).resolves.toBeDefined();
    expect(prisma.invitation.create).toHaveBeenCalled();
  });

  it('revokes any outstanding invitation before issuing the new one', async () => {
    const { service, prisma, audit } = build();

    await service.create(DTO, ADMIN);

    // Two live tokens for one seat means revoking the one you can see leaves the
    // other working. The revoke must also come first — the partial unique index
    // invitations_pending_email_key refuses the insert otherwise.
    const revoke = prisma.invitation.updateMany.mock.calls[0][0];
    expect(revoke.where).toMatchObject({ email: 'tester@example.com', acceptedAt: null, revokedAt: null });
    expect(revoke.data.revokedAt).toBeInstanceOf(Date);
    expect(prisma.invitation.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.invitation.create.mock.invocationCallOrder[0],
    );
    expect(audit.write.mock.calls[0][0].action).toBe('invitation.reissued');
  });

  it('records a first invitation as created rather than reissued', async () => {
    const { service, prisma, audit } = build();
    prisma.invitation.updateMany.mockResolvedValueOnce({ count: 0 });

    await service.create(DTO, ADMIN);

    expect(audit.write.mock.calls[0][0].action).toBe('invitation.created');
  });

  it('refuses a team belonging to another desk', async () => {
    const { service, prisma } = build({ team: null });
    await expect(service.create({ ...DTO, teamId: 'team-elsewhere' }, ADMIN)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it('fails the request when the mail cannot be sent, so nothing is left behind', async () => {
    // The whole handler runs inside the request transaction, so throwing here
    // rolls the invitation back. A row that exists with no mail behind it shows
    // "pending" forever and is indistinguishable from one being ignored.
    const { service } = build({ sendFails: true });
    await expect(service.create(DTO, ADMIN)).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('InvitationsService.lookup', () => {
  it('gives nothing away about a token that matches no row', async () => {
    const { service } = build({ resolvedRow: null });
    const res = await service.lookup(TOKEN);
    expect(res.valid).toBe(false);
    expect(res.email).toBeNull();
    expect(res.workspaceName).toBeNull();
  });

  it('rejects a malformed token without touching the database', async () => {
    const { service, prisma } = build();
    const res = await service.lookup('not-a-token');
    expect(res.valid).toBe(false);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('answers rather than throws for an expired link, and says when it expired', async () => {
    // A page load, not an action. Throwing makes the console render an error
    // boundary instead of the sentence that tells the person what to do next.
    const { service } = build({ resolvedRow: resolved({ expiresAt: LAST_WEEK }) });
    const res = await service.lookup(TOKEN);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/expired/i);
  });

  it('needs a password when no Plumo CS account exists for the address', async () => {
    const { service } = build();
    const res = await service.lookup(TOKEN);
    expect(res).toMatchObject({ valid: true, email: 'tester@example.com', needsPassword: true });
  });

  it('needs no password when the person already has an account', async () => {
    // One human, one account, many desks: accepting only adds a membership.
    const { service } = build({
      users: [
        { id: ADMIN.id, email: 'admin@example.com', name: 'Ada', isActive: true, passwordHash: 'x' },
        { id: 'u-2', email: 'tester@example.com', name: 'Bo', isActive: true, passwordHash: 'x' },
      ],
      membership: null,
    });
    const res = await service.lookup(TOKEN);
    expect(res).toMatchObject({ valid: true, needsPassword: false });
  });

  it('says so before showing a form when they are already a member', async () => {
    const { service } = build({
      users: [
        { id: ADMIN.id, email: 'admin@example.com', name: 'Ada', isActive: true, passwordHash: 'x' },
        { id: 'u-2', email: 'tester@example.com', name: 'Bo', isActive: true, passwordHash: 'x' },
      ],
      membership: { isActive: true },
    });
    const res = await service.lookup(TOKEN);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/already a member/i);
  });
});

describe('InvitationsService.accept', () => {
  const NEW_ACCOUNT = { name: 'Tess Ter', password: 'a-good-password' };

  it('creates the account, seats them, burns the invitation and returns a session', async () => {
    const { service, prisma } = build();

    const session = await service.accept(TOKEN, NEW_ACCOUNT);

    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.workspaceMembership.create).toHaveBeenCalledWith({
      data: { workspaceId: WS.id, userId: 'user-new', role: 'agent', teamId: null },
    });
    // Same shape /auth/login answers with — the console cannot tell the two apart.
    expect(session).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { id: 'user-new', email: 'tester@example.com', role: 'agent' },
      workspace: { id: WS.id, slug: WS.slug },
    });
  });

  it('binds the workspace before it touches anything workspace-scoped', async () => {
    // THE WHOLE REASON THIS FLOW IS DIFFICULT. The route is @Public, so nothing
    // has bound a tenant; unbound, the membership insert is refused by the policy
    // and the audit insert violates NOT NULL. Both after the bind, or neither.
    const { service, prisma } = build();

    await service.accept(TOKEN, NEW_ACCOUNT);

    expect(prisma.$executeRaw).toHaveBeenCalled();
    const bindOrder = prisma.$executeRaw.mock.invocationCallOrder[0];
    expect(bindOrder).toBeLessThan(prisma.workspaceMembership.create.mock.invocationCallOrder[0]);
    expect(bindOrder).toBeLessThan(prisma.auditLog.create.mock.invocationCallOrder[0]);
  });

  it('does it all in one transaction', async () => {
    const { service, prisma } = build();
    await service.accept(TOKEN, NEW_ACCOUNT);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('adds a membership to an existing account and never touches its password', async () => {
    const users = [
      { id: ADMIN.id, email: 'admin@example.com', name: 'Ada', isActive: true, passwordHash: 'x' },
      { id: 'u-2', email: 'tester@example.com', name: 'Bo', isActive: true, passwordHash: 'original' },
    ];
    const { service, prisma } = build({ users, membership: null });

    // A password supplied by habit is ignored, not refused. An invitation proves
    // the holder has the mailbox; it is not proof they are the person who already
    // owns this account, and overwriting the password would be a takeover.
    await service.accept(TOKEN, { name: 'Someone Else', password: 'brand-new-password' });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passwordHash: expect.anything() }) }),
    );
    expect(users.find((u) => u.id === 'u-2')!.passwordHash).toBe('original');
    expect(prisma.workspaceMembership.create).toHaveBeenCalledWith({
      data: { workspaceId: WS.id, userId: 'u-2', role: 'agent', teamId: null },
    });
  });

  it('reactivates the membership of somebody invited back', async () => {
    // (workspace_id, user_id) is unique, so a second row is not representable —
    // and their history on this desk should survive an offboarding.
    const { service, prisma } = build({
      users: [
        { id: ADMIN.id, email: 'admin@example.com', name: 'Ada', isActive: true, passwordHash: 'x' },
        { id: 'u-2', email: 'tester@example.com', name: 'Bo', isActive: true, passwordHash: 'x' },
      ],
      membership: { isActive: false },
    });

    await service.accept(TOKEN, {});

    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
    expect(prisma.workspaceMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true, role: 'agent', teamId: null } }),
    );
  });

  it('refuses somebody who is already an active member', async () => {
    const { service } = build({
      users: [
        { id: ADMIN.id, email: 'admin@example.com', name: 'Ada', isActive: true, passwordHash: 'x' },
        { id: 'u-2', email: 'tester@example.com', name: 'Bo', isActive: true, passwordHash: 'x' },
      ],
      membership: { isActive: true },
    });
    await expect(service.accept(TOKEN, {})).rejects.toThrow(ConflictException);
  });

  it('requires a name and a password only when the account has to be created', async () => {
    const { service } = build();
    await expect(service.accept(TOKEN, {})).rejects.toThrow(BadRequestException);
    await expect(service.accept(TOKEN, { name: 'Tess' })).rejects.toThrow(BadRequestException);
  });

  it('refuses an unknown token', async () => {
    const { service } = build({ resolvedRow: null });
    await expect(service.accept(TOKEN, NEW_ACCOUNT)).rejects.toThrow(NotFoundException);
  });

  it.each([
    ['expired', { expiresAt: LAST_WEEK }, /expired/i],
    ['revoked', { revokedAt: LAST_WEEK }, /withdrawn/i],
    ['accepted', { acceptedAt: LAST_WEEK }, /already been used/i],
  ])('refuses an %s invitation with its own message', async (_label, over, pattern) => {
    const { service, prisma } = build({ resolvedRow: resolved(over) });
    await expect(service.accept(TOKEN, NEW_ACCOUNT)).rejects.toThrow(GoneException);
    await expect(service.accept(TOKEN, NEW_ACCOUNT)).rejects.toThrow(pattern);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an invitation to a suspended desk without pretending the link is bad', async () => {
    // app_set_workspace RAISES on a non-active workspace, so this has to be
    // caught before the bind — and "contact your administrator" is a different
    // errand from "ask for a new link".
    const { service } = build({ resolvedRow: resolved({ workspaceActive: false }) });
    await expect(service.accept(TOKEN, NEW_ACCOUNT)).rejects.toThrow(ForbiddenException);
  });

  it('refuses when the account behind the address has been disabled', async () => {
    const { service } = build({
      users: [
        { id: ADMIN.id, email: 'admin@example.com', name: 'Ada', isActive: true, passwordHash: 'x' },
        { id: 'u-2', email: 'tester@example.com', name: 'Bo', isActive: false, passwordHash: 'x' },
      ],
    });
    // Accepting must not resurrect a globally disabled account through a side door.
    await expect(service.accept(TOKEN, {})).rejects.toThrow(ForbiddenException);
  });

  it('lets exactly one of two simultaneous clicks through', async () => {
    // The read above cannot be atomic — two clicks a millisecond apart both pass
    // it. The conditional UPDATE is the single-use guarantee, and the loser's
    // whole transaction, new account included, rolls back.
    const { service, prisma } = build({ claimCount: 0 });
    await expect(service.accept(TOKEN, NEW_ACCOUNT)).rejects.toThrow(GoneException);
    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it('mints the session only after the transaction has committed', async () => {
    // A refresh token belongs to `refresh_tokens`, which carries no workspace_id
    // and would have survived a rollback of everything it refers to.
    const { service, prisma } = build();
    await service.accept(TOKEN, NEW_ACCOUNT);
    expect(prisma.refreshToken.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.workspaceMembership.create.mock.invocationCallOrder[0],
    );
  });
});
