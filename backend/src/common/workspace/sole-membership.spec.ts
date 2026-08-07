import { ForbiddenException } from '@nestjs/common';
import { WorkspaceContextService } from './workspace-context.service';

/**
 * Can an unnamed request still resolve once a second workspace exists?
 *
 * THIS IS THE TEST THAT GUARDS AGAINST AN INSTANCE-WIDE LOGIN OUTAGE. The
 * console sends /auth/login and /auth/refresh with `auth: false`, and the
 * X-Workspace-Slug header is attached only to authenticated requests — so those
 * two endpoints structurally cannot name a workspace. While exactly one
 * workspace exists the server infers it and nobody notices. The moment a second
 * appears, the inference switches itself off and every login and every token
 * refresh on the instance answers 403.
 *
 * It does not even fail at a helpful moment: a successful single-tenant probe is
 * memoised for the life of the process, so the outage begins at the next restart
 * or deploy, disconnected from the change that caused it.
 *
 * A login knows WHO is asking even when it does not know WHICH desk. One active
 * membership means there was never anything to disambiguate — that is what these
 * cases pin down.
 */
describe('WorkspaceContextService — unnamed request resolution', () => {
  const MEMBERSHIP_ROW = {
    workspaceId: 'ws-1',
    role: 'admin',
    teamId: null,
    workspaceSlug: 'dar-blockchain',
  };

  /**
   * Routes each raw query by the function it calls, so a test can say "this user
   * has two memberships" without caring about SQL text elsewhere.
   */
  function build(opts: { soleRows?: unknown[]; namedRows?: unknown[]; activeWorkspaceIds?: string[] }) {
    const calls: string[] = [];

    const $queryRaw = jest.fn((sql: { strings?: string[]; sql?: string }) => {
      const text = (sql?.strings ?? []).join('') + (sql?.sql ?? '');
      if (text.includes('app_resolve_sole_membership')) {
        calls.push('sole');
        return Promise.resolve(opts.soleRows ?? []);
      }
      if (text.includes('app_resolve_membership')) {
        calls.push('named');
        return Promise.resolve(opts.namedRows ?? []);
      }
      calls.push('other');
      return Promise.resolve([]);
    });

    const prisma = {
      $queryRaw,
      workspace: { findUnique: jest.fn().mockResolvedValue({ slug: 'dar-blockchain' }) },
    };

    const service = new WorkspaceContextService(
      prisma as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );

    // The instance-wide probe, stubbed so these cases are about the ORDER of
    // fallbacks rather than about the probe's own SQL.
    (service as unknown as { activeWorkspaceIds: () => Promise<string[]> }).activeWorkspaceIds = jest
      .fn()
      .mockResolvedValue(opts.activeWorkspaceIds ?? ['ws-1']);

    return { service, calls, prisma };
  }

  it('resolves a login with no header when the user belongs to exactly one desk', async () => {
    // Two workspaces on the instance — the configuration that used to 403.
    const { service, calls } = build({
      soleRows: [MEMBERSHIP_ROW],
      activeWorkspaceIds: ['ws-1', 'ws-2'],
    });

    const membership = await service.resolveForUser('user-1');

    expect(membership.workspaceSlug).toBe('dar-blockchain');
    expect(membership.role).toBe('admin');
    // Answered from the caller's own membership; the instance-wide probe that
    // returns null on a multi-workspace instance was never consulted.
    expect(calls).toEqual(['sole']);
  });

  it('does not consult the sole-membership path when the request names a workspace', async () => {
    const { service, calls } = build({
      namedRows: [{ ...MEMBERSHIP_ROW, membershipActive: true }],
    });

    await service.resolveForUser('user-1', 'dar-blockchain');

    // An explicit header is an instruction, not a hint. Consulting memberships
    // first could answer with a different desk than the one asked for.
    expect(calls).toEqual(['named']);
  });

  it('refuses rather than guessing when the user belongs to several desks', async () => {
    // The function returns up to 2 rows precisely so this is distinguishable
    // from "exactly one". Picking one would drop somebody into whichever desk
    // the planner happened to return first.
    const { service } = build({
      soleRows: [MEMBERSHIP_ROW, { ...MEMBERSHIP_ROW, workspaceId: 'ws-2', workspaceSlug: 'other' }],
      activeWorkspaceIds: ['ws-1', 'ws-2'],
    });

    await expect(service.resolveForUser('user-1')).rejects.toThrow(ForbiddenException);
  });

  it('falls through to the single-tenant default when the user has no membership', async () => {
    const { service, calls } = build({
      soleRows: [],
      namedRows: [{ ...MEMBERSHIP_ROW, membershipActive: true }],
      activeWorkspaceIds: ['ws-1'],
    });

    await service.resolveForUser('user-1');

    // Behaviour on a single-workspace instance is unchanged — this fix narrows
    // the fallback, it does not replace it.
    expect(calls).toEqual(['sole', 'named']);
  });
});
