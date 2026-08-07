import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { WorkspaceContextService } from './workspace-context.service';

/**
 * Can somebody who belongs to TWO desks keep a session alive?
 *
 * Access tokens live 15 minutes, so every session in the console is really a
 * loop of /auth/refresh calls. AuthService.refresh re-resolves the membership on
 * each one — deliberately, so a revoked membership cannot be renewed by an old
 * token — which means a refresh that names no workspace has to be resolved by
 * guessing. app_resolve_sole_membership refuses to guess for a user with two
 * memberships, so the refresh answered 403, and client.js reads any failed
 * refresh as session death: signed out, on the quarter hour, forever.
 *
 * Nobody had two memberships when this was written, which is the only reason it
 * was never seen. Invitations create the first one.
 *
 * These cases run the REAL WorkspaceContextService behind the REAL controller —
 * mocking resolveForUser would assert the mock, and the bug lives exactly in
 * which arguments reach it.
 */
describe('/auth/refresh — a user on two desks', () => {
  const USER = { id: 'user-1', email: 'agent@example.com', name: 'Agent Example', isActive: true };

  const DAR = { workspaceId: 'ws-1', role: 'admin', teamId: null, workspaceSlug: 'dar-blockchain' };
  const FIRAS2 = { workspaceId: 'ws-2', role: 'agent', teamId: null, workspaceSlug: 'firas2workspace' };

  const REFRESH_TOKEN = 'refresh.jwt.token';
  const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

  /**
   * Both live desks, and a user seated on each. `namedRows` is keyed by slug so
   * the SECURITY DEFINER function behaves like the real one: it answers for the
   * workspace it was asked about, and for nothing else.
   */
  function build() {
    const resolvedSlugs: Array<string | undefined> = [];

    const namedRows: Record<string, unknown> = {
      'dar-blockchain': { ...DAR, membershipActive: true },
      firas2workspace: { ...FIRAS2, membershipActive: true },
    };

    const $queryRaw = jest.fn((sql: { strings?: string[]; values?: unknown[] }) => {
      const text = (sql?.strings ?? []).join('');
      if (text.includes('app_resolve_sole_membership')) {
        // Two rows. The function returns up to 2 precisely so "several" is
        // distinguishable from "exactly one", and this user is the "several".
        return Promise.resolve([DAR, FIRAS2]);
      }
      if (text.includes('app_resolve_membership')) {
        // values[1] is the slug — ${userId}, then ${target}.
        const slug = String(sql.values?.[1] ?? '');
        resolvedSlugs.push(slug);
        return Promise.resolve(namedRows[slug] ? [namedRows[slug]] : []);
      }
      return Promise.resolve([]);
    });

    const prisma = {
      $queryRaw,
      user: { findUnique: jest.fn().mockResolvedValue(USER), update: jest.fn().mockResolvedValue({}) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ slug: 'dar-blockchain' }) },
      refreshToken: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rt-old', tokenHash: sha256(REFRESH_TOKEN) }),
        create: jest.fn().mockResolvedValue({ id: 'rt-new' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const workspaces = new WorkspaceContextService(
      prisma as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );

    // Two active workspaces — production as of the tenancy cutover. This is the
    // configuration in which the instance-wide fallback switches itself off.
    (workspaces as unknown as { activeWorkspaceIds: () => Promise<string[]> }).activeWorkspaceIds = jest
      .fn()
      .mockResolvedValue(['ws-1', 'ws-2']);

    const auth = new AuthService(
      prisma as never,
      {
        verifyAsync: jest.fn().mockResolvedValue({ sub: USER.id, jti: 'rt-old' }),
        signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      } as never,
      { get: jest.fn().mockReturnValue('15m') } as never,
      {} as never,
      workspaces,
    );

    return { controller: new AuthController(auth), resolvedSlugs };
  }

  it('renews the session when the refresh names the desk it is already on', async () => {
    const { controller, resolvedSlugs } = build();

    const out = await controller.refresh({ refreshToken: REFRESH_TOKEN }, 'dar-blockchain');

    expect(out.accessToken).toBeTruthy();
    // The SAME desk, not merely A desk. A refresh renews a session; landing on
    // the neighbouring tenant would be worse than the logout it replaced.
    expect(out.workspace).toEqual({ id: 'ws-1', slug: 'dar-blockchain' });
    expect(out.user.role).toBe('admin');
    expect(resolvedSlugs).toEqual(['dar-blockchain']);
  });

  it('keeps the two desks apart — the slug decides which one, and the role with it', async () => {
    const { controller } = build();

    const out = await controller.refresh({ refreshToken: REFRESH_TOKEN }, 'firas2workspace');

    expect(out.workspace).toEqual({ id: 'ws-2', slug: 'firas2workspace' });
    // Authority is per desk. Carrying the previous pair's role over would make a
    // refresh a privilege escalation on whichever desk you refreshed into.
    expect(out.user.role).toBe('agent');
  });

  it('tolerates the header arriving padded, as a proxy may leave it', async () => {
    const { controller, resolvedSlugs } = build();

    await controller.refresh({ refreshToken: REFRESH_TOKEN }, '  dar-blockchain  ');

    expect(resolvedSlugs).toEqual(['dar-blockchain']);
  });

  it('still refuses to guess when nothing names a desk — that is the bug, reproduced', async () => {
    const { controller } = build();

    // This is what the console sent before client.js stopped gating the header
    // on `auth`. The refusal is correct; the fix is that a refresh no longer
    // arrives this way, NOT that the resolver started picking a desk.
    await expect(controller.refresh({ refreshToken: REFRESH_TOKEN }, undefined)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a desk this user is not on rather than falling back to one they are', async () => {
    const { controller } = build();

    await expect(controller.refresh({ refreshToken: REFRESH_TOKEN }, 'someone-elses-desk')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
