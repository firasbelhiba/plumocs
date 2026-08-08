/**
 * What the sign-in form says when sign-in fails.
 *
 * It said one thing — "incorrect email or password" — for every failure, so a
 * 401, a 403 and a 429 were indistinguishable. Somebody an admin had just
 * switched off retyped a correct password until they gave up; somebody being
 * rate-limited was told to try again, which is the one thing that makes a rate
 * limit worse.
 *
 * The line these cases guard hardest is the one that must NOT become specific:
 * a wrong password and an address with no account still read identically, or
 * this form tells the internet who works here.
 */
import { loginErrorMessage } from '@/components/screens/Login';
import Console from '@/components/Console';

const err = (status, code) => ({ status, code });

describe('loginErrorMessage', () => {
  it('says nothing when nothing failed', () => {
    expect(loginErrorMessage(null)).toBeNull();
    expect(loginErrorMessage(false)).toBeNull();
    expect(loginErrorMessage(undefined)).toBeNull();
  });

  it('reads identically for a wrong password and an unknown address', () => {
    // The API answers 401/UNAUTHENTICATED for both — and for a deactivated
    // account too. Nothing here may tell them apart.
    const wrongPassword = loginErrorMessage(err(401, 'UNAUTHENTICATED'));
    const unknownAddress = loginErrorMessage(err(401, 'UNAUTHENTICATED'));
    expect(wrongPassword).toBe(unknownAddress);
    expect(wrongPassword).toMatch(/incorrect email or password/i);
  });

  it('names the rate limit instead of blaming the password', () => {
    const msg = loginErrorMessage(err(429, 'RATE_LIMITED'));
    expect(msg).toMatch(/too many attempts/i);
    expect(msg).not.toMatch(/password/);
  });

  it('tells somebody whose desk access was switched off that it can be switched back', () => {
    const msg = loginErrorMessage(err(403, 'WORKSPACE_MEMBERSHIP_DISABLED'));
    expect(msg).toMatch(/turned off/);
    expect(msg).toMatch(/admin/);
    expect(msg).not.toMatch(/password/);
  });

  it('says "no access here" for every other workspace refusal, without saying which', () => {
    // Not a member, no such desk, desk suspended, several desks and none named —
    // the server collapses these on purpose so a valid login cannot be used to
    // map the instance. One message, and it must not un-collapse them.
    const denied = loginErrorMessage(err(403, 'WORKSPACE_ACCESS_DENIED'));
    const notNamed = loginErrorMessage(err(403, 'WORKSPACE_NOT_NAMED'));
    const bare = loginErrorMessage(err(403, 'FORBIDDEN'));
    expect(denied).toBe(notNamed);
    expect(denied).toBe(bare);
    expect(denied).toMatch(/can't reach this workspace/);
    expect(denied).not.toMatch(/password/);
  });

  it('distinguishes an unreachable server from a rejected credential', () => {
    expect(loginErrorMessage(err(0, 'NETWORK'))).toMatch(/network error/i);
  });

  it('falls back to the credential line for a bare `true`', () => {
    // The historical shape, and what the console still sends for an empty form.
    // No detail means no diagnosis — never a guessed one.
    expect(loginErrorMessage(true)).toMatch(/incorrect email or password/i);
    expect(loginErrorMessage({})).toMatch(/incorrect email or password/i);
    expect(loginErrorMessage(err(500, 'INTERNAL_ERROR'))).toMatch(/incorrect email or password/i);
  });

  it('passes a ready-made string through', () => {
    expect(loginErrorMessage('that invitation has expired')).toBe('that invitation has expired');
  });
});

/**
 * The other half of the path, and the half that was still broken after the
 * function above was written: Console.signIn caught the error and stored
 * `true`, so every message above collapsed back to the credential line before
 * it ever reached the screen. A table of distinct messages is worth nothing if
 * the thing that decides between them has been thrown away one frame earlier —
 * so these drive the real handler rather than the formatter.
 */
describe('Console.signIn — what reaches the screen', () => {
  /** A Console with synchronous state, as in settings-writes.test.js. */
  function mount() {
    const c = new Console({});
    c.setState = (next, cb) => {
      const delta = typeof next === 'function' ? next(c.state) : next;
      if (delta) c.state = { ...c.state, ...delta };
      if (cb) cb();
    };
    c.forceUpdate = () => {};
    c.toasts = [];
    c.toast = (text, tone) => c.toasts.push({ text, tone: tone || 'ok' });
    c.state = { ...c.state, loginEmail: 'rui@x.com', loginPw: 'correct horse' };
    return c;
  }

  it('keeps the error, so a switched-off membership does not read as a bad password', async () => {
    const c = mount();
    const denied = Object.assign(new Error('Your access to this workspace has been disabled'), {
      status: 403,
      code: 'WORKSPACE_MEMBERSHIP_DISABLED',
    });
    c.api = { login: jest.fn().mockRejectedValue(denied), bootstrap: jest.fn() };

    await c.signIn();

    // The regression in one line: `true` here is what erased the distinction.
    expect(c.state.loginError).not.toBe(true);
    expect(c.state.loginError).toBe(denied);
    expect(loginErrorMessage(c.state.loginError)).toMatch(/turned off/);
  });

  it('still shows the credential line for an empty form', async () => {
    const c = mount();
    c.state = { ...c.state, loginPw: '   ' };
    c.api = { login: jest.fn(), bootstrap: jest.fn() };

    await c.signIn();

    // Nothing was attempted, so there is no error object to carry — the bare
    // `true` shape has to keep working, which is why the formatter accepts it.
    expect(c.api.login).not.toHaveBeenCalled();
    expect(loginErrorMessage(c.state.loginError)).toMatch(/incorrect email or password/i);
  });

  it('clears the error once the address is edited', () => {
    const c = mount();
    c.state = { ...c.state, loginError: err(429, 'RATE_LIMITED') };
    c.onLoginEmail({ target: { value: 'rui@y.com' } });
    expect(loginErrorMessage(c.state.loginError)).toBeNull();
  });
});
