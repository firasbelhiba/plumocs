import { UnauthorizedException } from '@nestjs/common';
import { AuthService, PmSignInIdentity } from './auth.service';

/**
 * Who is allowed onto a support desk by signing in with Plumo?
 *
 * This is an authorization boundary, not a convenience feature: getting it
 * wrong means a read-only member of somebody's Plumo workspace can open every
 * customer conversation the organisation has. The rule is that PM decides who
 * may enter (owners and admins only) and CS keeps deciding what they may do.
 *
 * The cases below are the ones that would be silent in production if they
 * regressed — a member being let in looks exactly like a member being let in
 * legitimately, until someone reads the audit log.
 */
describe('AuthService.loginWithPm', () => {
  // `status` is part of the fixture because loginWithPm deliberately queries
  // desks WITHOUT a status filter and classifies afterwards — filtering in SQL
  // would hide a suspended desk and make provisioning try to re-create it.
  const DESK = { id: '11111111-1111-1111-1111-111111111111', slug: 'dar-blockchain', status: 'active' };

  // Mirrors the real /userinfo payload: owner of one workspace, plain member of
  // another. The member one must never influence the outcome.
  const identity = (overrides: Partial<PmSignInIdentity> = {}): PmSignInIdentity => ({
    sub: 'pm-sub-abc',
    email: 'owner@example.com',
    name: 'Owner Example',
    workspaces: [
      { id: 'pm-dar', slug: 'dar-blockchain', name: 'Dar Blockchain', roleId: 'P0' },
      { id: 'pm-alulu', slug: 'alulu', name: 'alulu', roleId: 'P2' },
    ],
    ...overrides,
  });

  function build(opts: {
    linkedUser?: unknown;
    emailTaken?: unknown;
    desks?: Array<{ id: string; slug: string; status: string }>;
    existingMembership?: unknown;
    autoProvision?: boolean;
  }) {
    const tx = {
      $executeRaw: jest.fn(),
      // Present so a test that reaches provisioning fails on its assertion
      // rather than on a missing mock. Provisioning itself is covered by
      // auth.service.provisioning.spec.ts.
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'ws-new', slug: 'new-desk' }]),
      team: { create: jest.fn().mockResolvedValue({ id: 'team-1' }) },
      slaPolicy: { createMany: jest.fn().mockResolvedValue({ count: 4 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1n }) },
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue(opts.existingMembership ?? null),
        create: jest.fn().mockResolvedValue({ id: 'm1' }),
      },
    };

    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(opts.linkedUser ?? null),
        findUnique: jest.fn().mockResolvedValue(opts.emailTaken ?? null),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'new-user',
          isActive: true,
          ...data,
        })),
        update: jest.fn().mockResolvedValue({}),
      },
      workspace: { findMany: jest.fn().mockResolvedValue(opts.desks ?? []) },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };

    const workspaces = {
      resolveForUser: jest
        .fn()
        .mockResolvedValue({ workspaceId: DESK.id, workspaceSlug: DESK.slug, role: 'admin', teamId: null }),
    };

    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') } as never,
      {
        get: jest.fn((key: string) => (key === 'pm.autoProvisionDesks' ? opts.autoProvision === true : '15m')),
      } as never,
      {} as never,
      workspaces as never,
    );

    return { service, prisma, workspaces, tx };
  }

  it('refuses a member or viewer, before it ever looks for a desk', async () => {
    const { service, prisma } = build({});
    const member = identity({
      workspaces: [
        { id: 'pm-alulu', slug: 'alulu', name: 'alulu', roleId: 'P2' },
        { id: 'pm-x', slug: 'x', name: 'X', roleId: 'P3' },
      ],
    });

    await expect(service.loginWithPm(member)).rejects.toThrow(UnauthorizedException);
    // Short-circuits on role. If this ever queries first, a bug in the desk
    // lookup could hand a member a session.
    expect(prisma.workspace.findMany).not.toHaveBeenCalled();
  });

  it('considers only the workspaces the caller owns or administers', async () => {
    const { service, prisma } = build({ desks: [DESK] });

    await service.loginWithPm(identity());

    // 'pm-alulu' (P2) must not appear: the caller is a plain member there, and
    // a desk linked to it is none of their business.
    const where = prisma.workspace.findMany.mock.calls[0][0].where;
    expect(where.pmWorkspaceId).toEqual({ in: ['pm-dar'] });

    // And NO status filter, deliberately. Filtering here would hide a suspended
    // desk, provisioning would conclude none exists and try to create one, and
    // the insert would hit workspaces_pm_workspace_id_key — a 500 on sign-in and
    // a route around the suspension. Status is classified after the query.
    expect(where.status).toBeUndefined();
  });

  it('refuses when there is no desk and auto-provisioning is switched off', async () => {
    // The kill switch. With it on — the default, and covered in
    // auth.service.provisioning.spec.ts — this same input creates the desk
    // instead. Sign-in is a tenant-creating path, so the ability to turn that
    // off without a deploy is part of the contract, not a nicety.
    const { service } = build({ desks: [], autoProvision: false });
    await expect(service.loginWithPm(identity())).rejects.toThrow(/No Plumo CS desk is connected/);
  });

  it('provisions the account and an admin seat on first sign-in', async () => {
    const { service, prisma, tx } = build({ desks: [DESK] });

    const session = await service.loginWithPm(identity());

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'owner@example.com', pmUserId: 'pm-sub-abc' }),
      }),
    );
    // Bound before the write, or RLS rejects it.
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.workspaceMembership.create).toHaveBeenCalledWith({
      data: { workspaceId: DESK.id, userId: 'new-user', role: 'admin' },
    });
    expect(session.accessToken).toBe('signed.jwt.token');
  });

  it('never adopts an existing account by email', async () => {
    const { service, prisma } = build({ desks: [DESK], emailTaken: { id: 'someone-else' } });

    // The takeover shape: PM emails are mutable, so matching on one would let a
    // caller who owns any linked workspace sign in as an unrelated CS admin.
    await expect(service.loginWithPm(identity())).rejects.toThrow(/already uses this email/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('leaves an existing membership exactly as CS set it', async () => {
    const { service, tx } = build({
      desks: [DESK],
      linkedUser: { id: 'u1', email: 'owner@example.com', name: 'Owner', isActive: true },
      existingMembership: { id: 'm-existing' },
    });

    await service.loginWithPm(identity());

    // A deliberate demotion to `agent`, or a deactivated seat, must survive the
    // next Plumo sign-in rather than being silently re-promoted to admin.
    expect(tx.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it('refuses a disabled CS account even when PM still says owner', async () => {
    const { service } = build({
      desks: [DESK],
      linkedUser: { id: 'u1', email: 'owner@example.com', name: 'Owner', isActive: false },
    });
    await expect(service.loginWithPm(identity())).rejects.toThrow(/has been disabled/);
  });

  it('refuses a desk the caller did not ask for rather than redirecting', async () => {
    const { service } = build({ desks: [DESK] });
    // Silently serving dar-blockchain here would show an admin a different
    // organisation's inbox and read as a bug in their favour.
    await expect(service.loginWithPm(identity(), 'some-other-desk')).rejects.toThrow(
      /do not administer that workspace/,
    );
  });
});
