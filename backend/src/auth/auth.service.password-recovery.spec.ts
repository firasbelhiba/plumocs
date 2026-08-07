import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Password recovery, and the two ways it was broken.
 *
 * 1. THE LINK. It was built from APP_URL, which on this deployment is the api
 *    (csapi.plumo.work). Every reset mail ever sent pointed at a host with no
 *    such page, so the feature 404'd for every user without ever erroring.
 *
 * 2. THE BYPASS. loginWithPm re-checks the PM role, the desk link and the desk
 *    status on every sign-in; login() checks none of them and cannot. So a
 *    password acquired through a reset is a credential that outlives being
 *    demoted, removed from the PM workspace, or having the PM account disabled
 *    — permanently, on a desk where an auto-provisioned admin is often the only
 *    one. An account that signs in through Plumo is therefore not allowed to
 *    acquire a password at all.
 *
 * What must NOT change is the response: forgot-password answers { ok: true } for
 * every address, whether it exists, has a password, or signs in through Plumo.
 * The moment those diverge it is an account-enumeration oracle for an
 * unauthenticated caller.
 */
describe('AuthService — password recovery', () => {
  const CONSOLE = 'https://cs.plumo.work';

  function build(opts: { user?: unknown; reset?: unknown; owner?: unknown } = {}) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          // forgotPassword looks the account up by email; resetPassword looks the
          // token's owner up by id. One mock serves both — the tests that care
          // set them to the same shape.
          opts.owner !== undefined ? opts.owner : (opts.user ?? null),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      passwordReset: {
        create: jest.fn().mockResolvedValue({ id: 'pr1' }),
        findFirst: jest.fn().mockResolvedValue(opts.reset ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const queue = { notify: jest.fn() };
    const service = new AuthService(
      prisma as never,
      {} as never,
      // consoleUrl, deliberately NOT appUrl — see the top of this file.
      { get: jest.fn((k: string) => (k === 'consoleUrl' ? CONSOLE : undefined)) } as never,
      queue as never,
      {} as never,
    );
    return { service, prisma, queue };
  }

  describe('forgotPassword', () => {
    it('links to the console, not to the api', async () => {
      const { service, queue } = build({ user: { id: 'u1', pmUserId: null } });

      await service.forgotPassword('agent@example.com');

      const { text } = queue.notify.mock.calls[0][0];
      expect(text).toContain(`${CONSOLE}/reset-password?token=`);
    });

    it('mints no token for an account that signs in through Plumo', async () => {
      const { service, prisma, queue } = build({ user: { id: 'u2', pmUserId: 'pm-sub-abc' } });

      const res = await service.forgotPassword('owner@example.com');

      expect(prisma.passwordReset.create).not.toHaveBeenCalled();
      // Still mailed, and the mail is where the explanation goes: delivery
      // already proves the reader holds the mailbox, so it leaks nothing. The
      // same sentence in the HTTP response would be an enumeration oracle.
      const { kind, text } = queue.notify.mock.calls[0][0];
      expect(text).toMatch(/signs in through Plumo/i);
      expect(text).not.toContain('token=');
      // 'password_reset' is the only kind the fanout processor handles before
      // requireWorkspace, and forgot-password arrives with no workspace bound. A
      // tidier-sounding kind here would retry to exhaustion and never arrive.
      expect(kind).toBe('password_reset');
      expect(res).toEqual({ ok: true });
    });

    it('answers identically for an unknown address, and does nothing', async () => {
      const { service, prisma, queue } = build({ user: null });

      await expect(service.forgotPassword('nobody@example.com')).resolves.toEqual({ ok: true });
      expect(prisma.passwordReset.create).not.toHaveBeenCalled();
      expect(queue.notify).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const LIVE_TOKEN = { id: 'pr1', userId: 'u1' };

    it('refuses a token belonging to a Plumo account', async () => {
      // The one-hour hole: tokens minted before forgotPassword stopped issuing
      // them stay valid across the deploy that closed that path.
      const { service, prisma } = build({ reset: LIVE_TOKEN, owner: { pmUserId: 'pm-sub-abc' } });

      await expect(service.resetPassword('tok', 'a-good-password')).rejects.toThrow(
        /signs in through Plumo/i,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('still resets a password-native account', async () => {
      const { service, prisma } = build({ reset: LIVE_TOKEN, owner: { pmUserId: null } });

      await expect(service.resetPassword('tok', 'a-good-password')).resolves.toEqual({ ok: true });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('refuses an unknown or expired token without naming a reason', async () => {
      const { service } = build({ reset: null });
      await expect(service.resetPassword('tok', 'a-good-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
