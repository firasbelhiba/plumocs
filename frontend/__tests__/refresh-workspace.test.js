/**
 * Can a session on a named desk stay alive?
 *
 * Access tokens last 15 minutes, so a working day is a loop of /auth/refresh.
 * The refresh went out `auth: false` — correctly, it carries no bearer token —
 * and the workspace header was gated on that same flag, so it also went out
 * naming no desk. The server re-resolves the membership on every refresh and
 * refuses to guess between two, so a user on two desks got a 403, and client.js
 * reads a failed refresh as session death: signed out on the quarter hour,
 * forever. Invitations create the first two-desk user.
 */
import { request, setSession, currentSession, setUnauthorizedHandler } from '@/lib/api/client';

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: () => Promise.resolve(JSON.stringify(body)),
});

const DAR = { id: 'ws-1', slug: 'dar-blockchain' };

/** The call at index `i`, as { url, headers }. */
const call = (i) => ({ url: String(global.fetch.mock.calls[i][0]), ...global.fetch.mock.calls[i][1] });
const refreshCall = () => {
  const i = global.fetch.mock.calls.findIndex(([u]) => String(u).endsWith('/auth/refresh'));
  return i < 0 ? null : call(i);
};

describe('/auth/refresh names its workspace', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setSession(null);
    global.fetch = jest.fn();
  });

  it('sends x-workspace-slug on the refresh despite it being an unauthenticated call', async () => {
    setSession({ accessToken: 'stale', refreshToken: 'r1', workspace: DAR });
    global.fetch
      .mockResolvedValueOnce(json({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'fresh', refreshToken: 'r2', user: { id: 'u' }, workspace: DAR }))
      .mockResolvedValueOnce(json({ data: 'ok' }));

    await expect(request('/tickets')).resolves.toEqual({ data: 'ok' });

    const refresh = refreshCall();
    expect(refresh.headers['x-workspace-slug']).toBe('dar-blockchain');
    // Still no credential on it — naming a desk and carrying a token are two
    // different things, which is exactly what the bug conflated.
    expect(refresh.headers.authorization).toBeUndefined();
  });

  it('keeps the session on the same desk across a refresh', async () => {
    setSession({ accessToken: 'stale', refreshToken: 'r1', workspace: DAR });
    global.fetch
      .mockResolvedValueOnce(json({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'fresh', refreshToken: 'r2', user: { id: 'u' }, workspace: DAR }))
      .mockResolvedValueOnce(json({ data: 'ok' }));

    await request('/tickets');

    expect(currentSession().workspace).toEqual(DAR);
    // And the retry is named too, or the refresh fixed nothing.
    expect(call(2).headers['x-workspace-slug']).toBe('dar-blockchain');
  });

  it('learns the desk from the refresh when the stored session predates it', async () => {
    // Anyone signed in before `workspace` was stored has one of these, and will
    // not sign in again for weeks.
    setSession({ accessToken: 'stale', refreshToken: 'r1' });
    global.fetch
      .mockResolvedValueOnce(json({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'fresh', refreshToken: 'r2', user: { id: 'u' }, workspace: DAR }))
      .mockResolvedValueOnce(json({ data: 'ok' }));

    await request('/tickets');

    expect(refreshCall().headers['x-workspace-slug']).toBeUndefined();
    expect(currentSession().workspace).toEqual(DAR);
  });

  it('kills the session rather than continuing on a desk it did not ask for', async () => {
    setSession({ accessToken: 'stale', refreshToken: 'r1', workspace: DAR });
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    global.fetch
      .mockResolvedValueOnce(json({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(
        json({ accessToken: 'fresh', refreshToken: 'r2', user: { id: 'u' }, workspace: { id: 'ws-2', slug: 'firas2workspace' } }),
      );

    await expect(request('/tickets')).rejects.toMatchObject({ status: 401 });
    // Showing an agent the neighbouring organisation's inbox would be worse than
    // the logout this whole change exists to prevent.
    expect(currentSession()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalled();
    setUnauthorizedHandler(null);
  });

  it('does not pin a fresh login to the previous session\'s desk', async () => {
    // Signing in as somebody else without signing out first: the stale slug must
    // not travel, or a valid login is refused with a 403 from another tenant.
    setSession({ accessToken: 'stale', refreshToken: 'r1', workspace: DAR });
    global.fetch.mockResolvedValue(json({ accessToken: 'a', refreshToken: 'b', user: { id: 'u2' } }));

    await request('/auth/login', { method: 'POST', body: { email: 'x@y.z' }, auth: false });

    expect(call(0).headers['x-workspace-slug']).toBeUndefined();
  });
});
