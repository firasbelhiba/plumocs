import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.module';
import type { Principal } from '../common/decorators';

/**
 * Can a workspace be left with nobody who can administer it?
 *
 * THIS IS THE TEST THAT GUARDS AGAINST AN UNRECOVERABLE DESK. Every route that
 * could hand out the admin role is itself `@Roles('admin')`, so once the last
 * administrator is demoted or offboarded there is no sequence of API calls that
 * restores access — it takes somebody with a psql prompt. The ways in are
 * mundane: an admin tidying up roles, or an admin closing their own account on
 * their last day.
 *
 * The cases below pin down three things that are easy to get subtly wrong:
 *  - the count is of MEMBERSHIPS on this desk, not of users, because one human
 *    is an admin here and an agent there;
 *  - an admin who cannot authenticate (globally disabled account) or who has
 *    left this desk (inactive membership) is not an administrator for this
 *    purpose, however the row reads;
 *  - the count and the write are one transaction, and the count takes a row
 *    lock — a plain `SELECT count(*)` lets two simultaneous demotions both see
 *    two admins and both succeed.
 */
describe('UsersService — the last administrator', () => {
  const WS = '11111111-1111-1111-1111-111111111111';
  const OTHER_WS = '22222222-2222-2222-2222-222222222222';

  type Seat = {
    userId: string;
    workspaceId: string;
    role: 'agent' | 'lead' | 'admin';
    /** `workspace_memberships.is_active` — still on this desk. */
    membershipActive?: boolean;
    /** `users.is_active` — may authenticate at all, anywhere. */
    userActive?: boolean;
  };

  /**
   * A fake roster that answers the locking query the way Postgres would, so a
   * case can say "these people sit on these desks" without restating SQL. The
   * workspace is read from the query's bind parameter rather than assumed,
   * which is what makes the cross-workspace case meaningful.
   */
  function build(seats: Seat[]) {
    const rows = seats.map((s) => ({ membershipActive: true, userActive: true, ...s }));
    const seatFor = (userId: string, workspaceId: string) =>
      rows.find((r) => r.userId === userId && r.workspaceId === workspaceId);

    const sql: string[] = [];
    /** Records whether each database call happened inside a transaction. */
    const steps: string[] = [];
    let depth = 0;

    const prisma = {
      $transaction: jest.fn(async (fn: () => Promise<unknown>) => {
        depth += 1;
        try {
          return await fn();
        } finally {
          depth -= 1;
        }
      }),

      $queryRaw: jest.fn((q: { strings?: string[]; values?: unknown[] }) => {
        sql.push((q.strings ?? []).join(''));
        steps.push(depth > 0 ? 'count:in-tx' : 'count:outside-tx');
        const ws = (q.values ?? [])[0] as string;
        return Promise.resolve(
          rows
            .filter((r) => r.workspaceId === ws && r.role === 'admin' && r.membershipActive && r.userActive)
            .map((r) => ({ userId: r.userId }))
            .sort((a, b) => a.userId.localeCompare(b.userId)),
        );
      }),

      user: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: jest.fn((args: any) => {
          const seat = seatFor(args.where.id, args.select.memberships.where.workspaceId);
          if (!seat) return Promise.resolve(null);
          return Promise.resolve({
            id: seat.userId,
            email: `${seat.userId}@example.com`,
            name: seat.userId,
            isActive: seat.userActive,
            avatarUrl: null,
            lastActiveAt: null,
            createdAt: new Date(0),
            memberships: [
              { role: seat.role, teamId: null, isActive: seat.membershipActive, availability: 'available' },
            ],
          });
        }),
        update: jest.fn(() => {
          steps.push(depth > 0 ? 'write:in-tx' : 'write:outside-tx');
          return Promise.resolve({});
        }),
      },
      workspaceMembership: {
        update: jest.fn(() => {
          steps.push(depth > 0 ? 'write:in-tx' : 'write:outside-tx');
          return Promise.resolve({});
        }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new UsersService(prisma as never, audit as never);
    return { service, prisma, audit, sql, steps };
  }

  const asAdmin = (id: string, workspaceId = WS): Principal => ({
    kind: 'user',
    id,
    workspaceId,
    role: 'admin',
  });

  /** An admin-scoped API key — the only principal that can demote a human admin
   *  other than that admin themselves, since a lead cannot reach these routes. */
  const asKey = (workspaceId = WS): Principal => ({
    kind: 'api_key',
    id: 'key-1',
    workspaceId,
    role: 'admin',
  });

  // ---------------------------------------------------------------- refusals

  it('refuses to demote the last admin', async () => {
    const { service, prisma, audit } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'bo', workspaceId: WS, role: 'agent' },
    ]);

    await expect(service.update('ada', { role: 'agent' }, asKey())).rejects.toThrow(ConflictException);

    // The refusal has to happen before the write, not merely be reported after
    // one: a thrown error the caller retries past is not a guard.
    expect(prisma.workspaceMembership.update).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('refuses to deactivate the last admin', async () => {
    const { service, prisma } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'bo', workspaceId: WS, role: 'agent' },
    ]);

    await expect(service.deactivate('ada', asKey())).rejects.toThrow(ConflictException);

    expect(prisma.workspaceMembership.update).not.toHaveBeenCalled();
    // Their session survives too — a half-applied offboarding that revoked the
    // tokens would lock the desk just as thoroughly as the membership write.
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when the last admin deactivates themselves', async () => {
    // The likeliest route to the broken state in practice, and the one nobody
    // is watching: the person doing it holds the role they are removing.
    const { service, prisma } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'bo', workspaceId: WS, role: 'agent' },
    ]);

    await expect(service.deactivate('ada', asAdmin('ada'))).rejects.toThrow(
      /You are the last active administrator/,
    );
    await expect(service.deactivate('ada', asAdmin('ada'))).rejects.toThrow(
      /Promote another member to admin first/,
    );

    expect(prisma.workspaceMembership.update).not.toHaveBeenCalled();
  });

  it('refuses when the last admin demotes themselves', async () => {
    const { service, prisma } = build([{ userId: 'ada', workspaceId: WS, role: 'admin' }]);

    await expect(service.update('ada', { role: 'lead' }, asAdmin('ada'))).rejects.toThrow(ConflictException);
    expect(prisma.workspaceMembership.update).not.toHaveBeenCalled();
  });

  it('refuses to disable the last admin’s account globally', async () => {
    // `isActive` on this DTO is the users row, not the membership — it takes
    // away the ability to sign in at all, so it empties the desk just as surely
    // as a demotion while leaving a membership that still reads `admin`.
    const { service, prisma } = build([{ userId: 'ada', workspaceId: WS, role: 'admin' }]);

    await expect(service.update('ada', { isActive: false }, asKey())).rejects.toThrow(ConflictException);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.workspaceMembership.update).not.toHaveBeenCalled();
  });

  it('refuses to leave the desk with an admin who cannot sign in', async () => {
    // Promoting somebody to admin and disabling their account in the same
    // request would satisfy a naive "is the new role admin?" check.
    const { service, prisma } = build([{ userId: 'ada', workspaceId: WS, role: 'admin' }]);

    await expect(service.update('ada', { role: 'admin', isActive: false }, asKey())).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  // ------------------------------------------------- who counts as an admin

  it('does not count an admin of another workspace', async () => {
    // The whole reason role lives on the membership: Cleo administers a
    // different desk, which does nothing for this one.
    const { service, prisma } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'cleo', workspaceId: OTHER_WS, role: 'admin' },
    ]);

    await expect(service.update('ada', { role: 'agent' }, asKey())).rejects.toThrow(ConflictException);
    expect(prisma.workspaceMembership.update).not.toHaveBeenCalled();
  });

  it('does not count an admin whose account is globally disabled', async () => {
    const { service } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'zed', workspaceId: WS, role: 'admin', userActive: false },
    ]);

    await expect(service.update('ada', { role: 'agent' }, asKey())).rejects.toThrow(ConflictException);
  });

  it('does not count an admin who has already left this desk', async () => {
    const { service } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'zed', workspaceId: WS, role: 'admin', membershipActive: false },
    ]);

    await expect(service.update('ada', { role: 'agent' }, asKey())).rejects.toThrow(ConflictException);
  });

  // ----------------------------------------------------------- what is allowed

  it('allows demoting the second-to-last admin', async () => {
    // The floor is one, not two. Guarding anything above it would make normal
    // role administration impossible.
    const { service, prisma } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'bo', workspaceId: WS, role: 'admin' },
    ]);

    await service.update('bo', { role: 'agent' }, asAdmin('ada'));

    expect(prisma.workspaceMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'agent' } }),
    );
  });

  it('allows the second-to-last admin to deactivate themselves', async () => {
    const { service, prisma } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'bo', workspaceId: WS, role: 'admin' },
    ]);

    await service.deactivate('bo', asAdmin('bo'));

    expect(prisma.workspaceMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('allows deactivating somebody who is not an admin', async () => {
    const { service, prisma } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'bo', workspaceId: WS, role: 'lead' },
    ]);

    await service.deactivate('bo', asAdmin('ada'));

    expect(prisma.workspaceMembership.update).toHaveBeenCalled();
  });

  it('leaves a desk that already has no admin editable', async () => {
    // This guard is younger than the data it protects. If production already
    // contains an admin-less workspace, refusing every edit there would freeze
    // it behind an error the product gives nobody a way to clear.
    const { service, prisma } = build([
      { userId: 'zed', workspaceId: WS, role: 'admin', membershipActive: false },
      { userId: 'bo', workspaceId: WS, role: 'agent' },
    ]);

    await service.deactivate('bo', asKey());

    expect(prisma.workspaceMembership.update).toHaveBeenCalled();
  });

  it('does not consult the roster for edits that cannot cost an admin', async () => {
    const { service, prisma } = build([{ userId: 'ada', workspaceId: WS, role: 'admin' }]);

    await service.update('ada', { name: 'Ada L.', availability: 'away' }, asAdmin('ada'));
    await service.update('ada', { role: 'admin' }, asAdmin('ada'));

    // A rename, an availability flip and a no-op re-grant of admin all leave the
    // count alone, and none of them should take a row lock over the roster.
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------- how it is checked

  it('counts and writes inside one transaction', async () => {
    const { service, steps } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'bo', workspaceId: WS, role: 'admin' },
    ]);

    await service.deactivate('bo', asAdmin('ada'));

    // Split across two transactions, two admins offboarding each other at the
    // same moment would each read two admins and each be allowed.
    expect(steps).toEqual(['count:in-tx', 'write:in-tx']);
  });

  it('locks the rows it counts, in a fixed order, across both tables', async () => {
    const { service, sql } = build([
      { userId: 'ada', workspaceId: WS, role: 'admin' },
      { userId: 'bo', workspaceId: WS, role: 'admin' },
    ]);

    await service.update('bo', { role: 'agent' }, asAdmin('ada'));

    const [text] = sql;
    // Without the lock the transaction is decoration: both racing callers read
    // the same snapshot and both commit.
    expect(text).toContain('FOR UPDATE OF m, u');
    // `users` is locked as well as the membership because row re-checking only
    // applies to the relations named here — otherwise a concurrent global
    // account disable stays invisible to this query's re-evaluation.
    expect(text).toContain('JOIN users u');
    // A fixed lock order turns a would-be deadlock into a queue.
    expect(text).toContain('ORDER BY m.user_id');
    // Scoped to this desk, and to people who are actually able to act.
    expect(text).toContain('m.workspace_id =');
    expect(text).toContain('m.is_active');
    expect(text).toContain('u.is_active');
  });
});
