/**
 * The HTTP client: session handling, the error envelope, and the single-flight
 * refresh that has to survive two concurrent 401s.
 */
import { ApiError, qs, request, restoreSession, setSession, currentSession, setUnauthorizedHandler } from '@/lib/api/client';

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: () => Promise.resolve(JSON.stringify(body)),
});

describe('qs', () => {
  it('returns an empty string when nothing is set', () => {
    expect(qs({})).toBe('');
    expect(qs({ a: undefined, b: null, c: '' })).toBe('');
  });

  it('keeps zero and false, which are meaningful values', () => {
    expect(qs({ offset: 0 })).toBe('?offset=0');
    expect(qs({ flag: false })).toBe('?flag=false');
  });

  it('encodes special characters', () => {
    expect(qs({ q: 'a b&c' })).toBe('?q=a+b%26c');
  });
});

describe('ApiError', () => {
  it('flags a network failure as offline', () => {
    expect(new ApiError('down', { status: 0 }).offline).toBe(true);
    expect(new ApiError('nope', { status: 404 }).offline).toBe(false);
  });

  it('falls back to an HTTP-derived code', () => {
    expect(new ApiError('x', { status: 404 }).code).toBe('HTTP_404');
    expect(new ApiError('x', { status: 0 }).code).toBe('NETWORK');
  });
});

describe('session storage', () => {
  beforeEach(() => {
    localStorage.clear();
    setSession(null);
  });

  it('round-trips through localStorage', () => {
    setSession({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' } });
    expect(JSON.parse(localStorage.getItem('plumo.session')).accessToken).toBe('a');
    expect(currentSession().user.id).toBe('u1');
  });

  it('clears on null', () => {
    setSession({ accessToken: 'a', refreshToken: 'r' });
    setSession(null);
    expect(localStorage.getItem('plumo.session')).toBeNull();
  });

  it('survives corrupt stored json', () => {
    localStorage.setItem('plumo.session', '{not json');
    setSession(null);
    expect(restoreSession()).toBeNull();
  });
});

describe('request', () => {
  beforeEach(() => {
    localStorage.clear();
    setSession(null);
    global.fetch = jest.fn();
  });

  it('unwraps the backend error envelope', async () => {
    global.fetch.mockResolvedValue(
      json({ error: { code: 'TICKET_INVALID_TRANSITION', message: 'Cannot move a closed ticket to pending' }, requestId: 'req-7' }, 422),
    );
    await expect(request('/tickets/x')).rejects.toMatchObject({
      status: 422,
      code: 'TICKET_INVALID_TRANSITION',
      message: 'Cannot move a closed ticket to pending',
      requestId: 'req-7',
    });
  });

  it('reports an unreachable server as offline rather than a crash', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await request('/tickets').catch((e) => e);
    expect(err.offline).toBe(true);
  });

  it('attaches the bearer token when there is a session', async () => {
    setSession({ accessToken: 'tok', refreshToken: 'r' });
    global.fetch.mockResolvedValue(json({ ok: true }));
    await request('/auth/me');
    expect(global.fetch.mock.calls[0][1].headers.authorization).toBe('Bearer tok');
  });

  it('omits credentials on public calls', async () => {
    setSession({ accessToken: 'tok', refreshToken: 'r' });
    global.fetch.mockResolvedValue(json({ ok: true }));
    await request('/auth/login', { method: 'POST', body: {}, auth: false });
    expect(global.fetch.mock.calls[0][1].headers.authorization).toBeUndefined();
  });

  it('refreshes once on 401 and retries the original call', async () => {
    setSession({ accessToken: 'stale', refreshToken: 'r1' });
    global.fetch
      .mockResolvedValueOnce(json({ error: { message: 'expired' } }, 401)) // original
      .mockResolvedValueOnce(json({ accessToken: 'fresh', refreshToken: 'r2', user: { id: 'u' } })) // refresh
      .mockResolvedValueOnce(json({ data: 'ok' })); // retry

    await expect(request('/tickets')).resolves.toEqual({ data: 'ok' });
    expect(currentSession().accessToken).toBe('fresh');
    expect(global.fetch.mock.calls[2][1].headers.authorization).toBe('Bearer fresh');
  });

  // two tabs' worth of parallel calls must not each burn a refresh token
  it('single-flights concurrent refreshes', async () => {
    setSession({ accessToken: 'stale', refreshToken: 'r1' });
    global.fetch.mockImplementation((url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return Promise.resolve(json({ accessToken: 'fresh', refreshToken: 'r2', user: { id: 'u' } }));
      }
      const auth = global.fetch.mock.calls.at(-1)?.[1]?.headers?.authorization;
      return Promise.resolve(auth === 'Bearer fresh' ? json({ data: 'ok' }) : json({ error: { message: 'expired' } }, 401));
    });

    await Promise.all([request('/tickets'), request('/customers'), request('/tags')]);
    const refreshCalls = global.fetch.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('clears the session and notifies when the refresh itself fails', async () => {
    setSession({ accessToken: 'stale', refreshToken: 'dead' });
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    global.fetch
      .mockResolvedValueOnce(json({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(json({ error: { message: 'revoked' } }, 401));

    await expect(request('/tickets')).rejects.toBeInstanceOf(ApiError);
    expect(currentSession()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalled();
    setUnauthorizedHandler(null);
  });

  it('does not attempt a refresh when there is no session', async () => {
    global.fetch.mockResolvedValue(json({ error: { message: 'nope' } }, 401));
    await expect(request('/tickets')).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
