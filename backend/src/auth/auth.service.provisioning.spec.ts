import { UnauthorizedException } from '@nestjs/common';
import { AuthService, PmSignInIdentity, slugify, slugCandidates } from './auth.service';

/**
 * Creating a desk on first sign-in.
 *
 * Whoever owns a Plumo workspace owns its support desk, so a PM owner whose
 * organisation has no desk gets one made for them rather than a refusal. That
 * turns an unauthenticated endpoint into a tenant-creating one, which is why
 * these cases are less about the happy path than about the ways it must NOT
 * fire: on a suspended desk, with the switch off, or twice for one organisation.
 */
describe('AuthService — desk provisioning', () => {
  const identity = (): PmSignInIdentity => ({
    sub: 'pm-sub-new',
    email: 'founder@example.com',
    name: 'Firas Founder',
    workspaces: [
      { id: 'pm-firas2', slug: 'firas2workspace', name: 'Firas2workspace', roleId: 'P0' },
      { id: 'pm-alulu', slug: 'alulu', name: 'alulu', roleId: 'P2' },
    ],
  });

  function build(opts: { existingDesks?: unknown[]; autoProvision?: boolean; insertReturns?: unknown[]; raceRow?: unknown }) {
    const tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn((sql: { strings?: string[]; values?: unknown[] }) => {
        const text = (sql?.strings ?? []).join('');
        if (text.includes('INSERT INTO workspaces')) {
          return Promise.resolve(opts.insertReturns ?? [{ id: 'ws-new', slug: 'firas2workspace' }]);
        }
        return Promise.resolve(opts.raceRow ? [opts.raceRow] : []);
      }),
      team: { create: jest.fn().mockResolvedValue({ id: 'team-1' }) },
      slaPolicy: { createMany: jest.fn().mockResolvedValue({ count: 4 }) },
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'm1' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1n }) },
    };

    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user-new', email: 'founder@example.com', name: 'Firas Founder', isActive: true }),
        update: jest.fn().mockResolvedValue({}),
      },
      workspace: { findMany: jest.fn().mockResolvedValue(opts.existingDesks ?? []) },
      refreshToken: { create: jest.fn().mockResolvedValue({ id: 'rt1' }), update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };

    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn().mockResolvedValue('jwt') } as never,
      { get: jest.fn((k: string) => (k === 'pm.autoProvisionDesks' ? opts.autoProvision !== false : '15m')) } as never,
      {} as never,
      {
        resolveForUser: jest
          .fn()
          .mockResolvedValue({ workspaceId: 'ws-new', workspaceSlug: 'firas2workspace', role: 'admin', teamId: 'team-1' }),
      } as never,
    );

    return { service, prisma, tx };
  }

  describe('slug derivation', () => {
    it('never produces a trailing hyphen, which the format CHECK rejects', () => {
      // "Acme, Inc." -> "acme-inc-" without the second strip.
      expect(slugify('Acme, Inc.')).toBe('acme-inc');
      expect(slugify('  spaced  out  ')).toBe('spaced-out');
      // Truncation at 32 can itself land on a hyphen.
      expect(slugify('a'.repeat(30) + ' bcdefg')).not.toMatch(/-$/);
    });

    it('strips accents rather than dropping the word', () => {
      expect(slugify('Café Central')).toBe('cafe-central');
    });

    it('rejects reserved and empty candidates', () => {
      expect(slugify('admin')).toBeNull();
      expect(slugify('API')).toBeNull();
      expect(slugify('!!!')).toBeNull();
      expect(slugify('日本語')).toBeNull();
    });

    it('always ends with a candidate that cannot fail', () => {
      // An organisation whose name yields nothing usable still gets a desk.
      const candidates = slugCandidates('日本語', '!!!', '699b4324b65aafb6840afa63');
      // Nothing else survived, so the deterministic fallback is the only option
      // — and it is still a valid, unreserved, correctly formatted slug.
      expect(candidates).toEqual(['desk-840afa63']);
      expect(candidates[candidates.length - 1]).toMatch(/^desk-[0-9a-f]{8}$/);
    });

    it('prefers the PM slug, then the name, then numbered variants', () => {
      const c = slugCandidates('acme', 'Acme, Inc.', '699b4324b65aafb6840afa63');
      expect(c[0]).toBe('acme');
      expect(c[1]).toBe('acme-inc');
      expect(c).toContain('acme-2');
    });
  });

  it('creates the desk, a team, four SLA policies, an admin seat and an audit row', async () => {
    const { service, tx } = build({ existingDesks: [] });

    await service.loginWithPm(identity());

    // Bound before any workspace-scoped write, or RLS rejects all of them.
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.team.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Support' }) }),
    );
    // One per priority. A priority with no policy produces a null due date and
    // then fails as silence: no breach tag, no notification, no webhook.
    const policies = tx.slaPolicy.createMany.mock.calls[0][0].data;
    expect(policies).toHaveLength(4);
    expect(policies.map((p: { priority: string }) => p.priority).sort()).toEqual(['high', 'low', 'normal', 'urgent']);
    expect(policies.every((p: { businessHoursId?: string }) => p.businessHoursId === undefined)).toBe(true);

    expect(tx.workspaceMembership.create).toHaveBeenCalledWith({
      data: { workspaceId: 'ws-new', userId: 'user-new', role: 'admin', teamId: 'team-1' },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'workspace.provisioned' }) }),
    );
  });

  it('provisions only for workspaces the caller administers', async () => {
    const { service, tx } = build({ existingDesks: [] });

    await service.loginWithPm(identity());

    // 'alulu' is P2. Its name must never reach the INSERT.
    const insertCall = tx.$queryRaw.mock.calls.find((c) => (c[0]?.strings ?? []).join('').includes('INSERT'));
    expect(JSON.stringify(insertCall?.[0]?.values ?? [])).toContain('pm-firas2');
    expect(JSON.stringify(insertCall?.[0]?.values ?? [])).not.toContain('pm-alulu');
  });

  it('refuses instead of provisioning when the switch is off', async () => {
    const { service, tx } = build({ existingDesks: [], autoProvision: false });

    await expect(service.loginWithPm(identity())).rejects.toThrow(/No Plumo CS desk is connected/);
    expect(tx.team.create).not.toHaveBeenCalled();
  });

  it('does not provision around a suspended desk', async () => {
    // The trap: filtering the query to status=active would hide this row, the
    // code would decide no desk exists, and the INSERT would hit the
    // pm_workspace_id unique index — a 500 on sign-in, and a way to escape a
    // suspension by re-creating the desk.
    const { service, tx } = build({
      existingDesks: [{ id: 'ws-susp', slug: 'firas2workspace', status: 'suspended' }],
    });

    await expect(service.loginWithPm(identity())).rejects.toThrow(UnauthorizedException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('adopts the winner and seeds nothing when two sign-ins race', async () => {
    // ON CONFLICT DO NOTHING returned no row: another request created this
    // organisation's desk moments ago. Seeding again would leave two Support
    // teams and eight SLA policies.
    const { service, tx } = build({
      existingDesks: [],
      insertReturns: [],
      raceRow: { id: 'ws-winner', slug: 'firas2workspace', status: 'active' },
    });

    await service.loginWithPm(identity());

    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.slaPolicy.createMany).not.toHaveBeenCalled();
    // ...but the loser still gets their seat on the winner's desk.
    expect(tx.workspaceMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'ws-winner', role: 'admin' }) }),
    );
  });
});
