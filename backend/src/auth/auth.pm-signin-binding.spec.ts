import { PmIdentityService } from '../pm-identity/pm-identity.service';

/**
 * The browser half of a "Sign in with Plumo".
 *
 * A LINK names its user in the state row, so the callback can only apply the
 * identity to whoever started it. A SIGN-IN names nobody, which left the state
 * row as the only credential — and a state row belongs to whoever called
 * /signin. The attack it enabled: start a flow, authorise it against your own PM
 * account, stop before the callback, hand the victim `?code=…&state=…`. Their
 * console adopts your session and everything they type afterwards lands in an
 * inbox you can read.
 *
 * These cases are the ones that fail SILENTLY in production if they regress. A
 * cookie the browser refuses to store, or refuses to send back, does not error
 * — it makes every sign-in look like a mismatch, or makes every mismatch look
 * like a match. Lives under auth/ rather than pm-identity/ because this is an
 * authentication boundary, not an integration detail.
 */
describe('PmIdentityService — sign-in browser binding', () => {
  const REDIRECT = 'https://csapi.plumo.work/api/v1/auth/pm/callback';

  const build = (redirectUri = REDIRECT) =>
    new PmIdentityService({} as never, {
      get: jest.fn((k: string) =>
        k === 'pm.issuer' ? 'https://pm.plumo.work' : k === 'pm.redirectUri' ? redirectUri : undefined,
      ),
    } as never);

  it('starts the flow on this api, at the callback\'s own path prefix', () => {
    // The cookie is only stored if it is set during a top-level navigation to
    // this origin, and only sent back if the two paths agree. Deriving the hop
    // from APP_URL instead would satisfy neither on a deployment where the api
    // and the console are different hosts — which is every real one.
    expect(build().signInRedirectUrl).toBe('https://csapi.plumo.work/api/v1/auth/pm/signin/redirect');
  });

  it('scopes the cookie to the callback\'s directory and keeps it off the browser', () => {
    const cookie = build().signInBindingCookie('state-abc');

    expect(cookie).toContain('pm_signin_state=state-abc');
    expect(cookie).toContain('Path=/api/v1/auth/pm');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    // Lax, never Strict: the callback is a top-level GET navigation from PM's
    // origin. Strict would drop the cookie there and refuse every sign-in.
    expect(cookie).toContain('SameSite=Lax');
  });

  it('omits Secure when the redirect itself is plain http', () => {
    // Follows the scheme we actually redirect to rather than NODE_ENV. A Secure
    // cookie is dropped over http without a word, so a local deployment would
    // refuse every sign-in and it would read as a bug in the comparison.
    expect(build('http://localhost:3001/api/v1/auth/pm/callback').signInBindingCookie('s')).not.toContain(
      'Secure',
    );
  });

  it('expires the cookie rather than merely blanking it', () => {
    const cleared = build().clearedSignInBindingCookie();
    expect(cleared).toContain('pm_signin_state=;');
    expect(cleared).toContain('Max-Age=0');
    // Same Path, or the browser keeps the original alongside the replacement.
    expect(cleared).toContain('Path=/api/v1/auth/pm');
  });

  describe('signInStateMatches', () => {
    const svc = build();
    const STATE = 'Zm9vYmFyYmF6cXV1eA';

    it('accepts the state the browser was actually given', () => {
      expect(svc.signInStateMatches(`other=1; pm_signin_state=${STATE}; x=2`, STATE)).toBe(true);
    });

    it('refuses a callback this browser never started', () => {
      // The whole attack in one line: a valid state row, no matching cookie.
      expect(svc.signInStateMatches(undefined, STATE)).toBe(false);
      expect(svc.signInStateMatches('pm_signin_state=someone-elses', STATE)).toBe(false);
    });

    it('refuses when either half is missing rather than matching two blanks', () => {
      expect(svc.signInStateMatches('pm_signin_state=', '')).toBe(false);
      expect(svc.signInStateMatches(`pm_signin_state=${STATE}`, undefined)).toBe(false);
      expect(svc.signInStateMatches('unrelated=1', STATE)).toBe(false);
    });

    it('does not match on a prefix', () => {
      // timingSafeEqual throws on unequal lengths, so the length check in front
      // of it is what keeps a short cookie from becoming a 500 instead of a no.
      expect(svc.signInStateMatches(`pm_signin_state=${STATE.slice(0, 5)}`, STATE)).toBe(false);
      expect(svc.signInStateMatches(`pm_signin_state=${STATE}extra`, STATE)).toBe(false);
    });
  });

  it('still clears a cookie when PM is not configured at all', () => {
    // The callback is @Public() and reachable on a deployment with no
    // PM_REDIRECT_URI, and its failure path clears this cookie before bouncing
    // back to the console. redirectUri is '' there, and `new URL('')` throws —
    // so without the guard the tidy "that link was incomplete" bounce becomes a
    // 500 on a blank api page, which is the one place a user cannot recover from.
    const svc = build('');
    expect(() => svc.clearedSignInBindingCookie()).not.toThrow();
    expect(svc.clearedSignInBindingCookie()).toContain('Path=/');
  });
});
