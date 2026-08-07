'use client';

/**
 * HTTP client for the Plumo CS API.
 *  - attaches the JWT access token
 *  - refreshes once (single-flight) on 401, then retries
 *  - unwraps the backend's error envelope { error: { code, message }, requestId }
 *  - persists the session in localStorage
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

const STORAGE_KEY = 'plumo.session';

let session = null; // { accessToken, refreshToken, user }
let refreshing = null; // single-flight refresh promise
let onUnauthorized = null; // callback when the session dies

export class ApiError extends Error {
  constructor(message, { status, code, details, requestId } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.code = code ?? (status ? `HTTP_${status}` : 'NETWORK');
    this.details = details;
    this.requestId = requestId;
  }
  get offline() {
    return this.status === 0;
  }
}

/**
 * "Keep me signed in" decides the store: localStorage survives a browser
 * restart, sessionStorage dies with the tab. We read both on restore so an
 * existing session is found either way.
 */
let persistent = true;

export function restoreSession() {
  if (session) return session;
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (raw) {
        session = JSON.parse(raw);
        persistent = store === localStorage;
        return session;
      }
    } catch {
      /* corrupt entry — fall through */
    }
  }
  session = null;
  return session;
}

export function setSession(next, opts = {}) {
  if (opts.persist !== undefined) persistent = !!opts.persist;
  session = next;
  const keep = persistent ? localStorage : sessionStorage;
  const drop = persistent ? sessionStorage : localStorage;
  try {
    drop.removeItem(STORAGE_KEY);
    if (next) keep.setItem(STORAGE_KEY, JSON.stringify(next));
    else keep.removeItem(STORAGE_KEY);
  } catch {
    /* private mode etc. */
  }
}

export function currentSession() {
  return session;
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * @param {object} opts
 * @param {boolean} [opts.auth]      send the bearer token, and treat a 401 as
 *                                   "refresh and retry" rather than an answer.
 * @param {boolean} [opts.workspace] name the desk with X-Workspace-Slug.
 *                                   Defaults to `auth`, which is what every
 *                                   caller wants; /auth/refresh overrides it.
 */
async function rawRequest(path, { method = 'GET', body, headers = {}, auth = true, workspace = auth } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(auth && session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {}),
        // Name the workspace explicitly whenever we know it.
        //
        // The server can infer it while exactly one workspace exists, and that
        // is the only reason logins work today. That inference deliberately
        // disables itself as soon as there are two — at which point every
        // request without this header is a 403. Sending it now means the second
        // workspace is a data change, not an outage.
        //
        // Gated on `workspace`, NOT on `auth`. Those two were the same flag
        // once, and conflating them is what logged a two-desk user out every
        // fifteen minutes: /auth/refresh is `auth: false` because it carries no
        // bearer token, which silently also meant "do not name the desk", and
        // an unnamed refresh for somebody with two memberships is a 403 the
        // client reads as session death. Naming a desk is about WHICH tenant,
        // carrying a token is about WHO — a public endpoint can need the first
        // without the second.
        //
        // Still off for /auth/login and the invitation endpoints, which default
        // it from `auth: false`: those decide which desk you land on, and
        // pinning them to whatever desk the previous session happened to be on
        // would refuse a valid sign-in as somebody else.
        //
        // Older sessions stored before this shipped have no workspace, so this
        // stays absent and the server falls back exactly as before.
        ...(workspace && session?.workspace?.slug ? { 'x-workspace-slug': session.workspace.slug } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("can't reach the server — is the backend running?", { status: 0 });
  }

  const payload = await parseBody(res);
  if (res.ok) return payload;

  const err = payload?.error ?? {};
  throw new ApiError(err.message ?? `Request failed (${res.status})`, {
    status: res.status,
    code: err.code,
    details: err.details,
    requestId: payload?.requestId,
  });
}

async function refreshTokens() {
  if (!session?.refreshToken) throw new ApiError('No session', { status: 401 });
  if (!refreshing) {
    // The desk this session is already on, read before the request so the
    // check below compares against what we actually asked for.
    const asked = session.workspace?.slug ?? null;
    refreshing = rawRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
      auth: false,
      // Named even though this is a public endpoint. The server re-resolves the
      // membership on every refresh — deliberately, so a revoked one cannot be
      // renewed — and with nothing naming a desk that resolution has to guess.
      // It refuses to guess for somebody with two memberships and answers 403,
      // which lands in the catch below as session death: a 15-minute logout
      // loop for anyone on two desks. Invitations create the first such person.
      //
      // The header rather than a `workspaceSlug` field on the body: it is the
      // one way a client names a tenant everywhere else on this API, the route
      // already reads it (auth.controller.ts), and the global ValidationPipe
      // runs `forbidNonWhitelisted`, so an unknown body field is a 400 until
      // RefreshDto grows one. One mechanism, no second way to be wrong.
      workspace: true,
    })
      .then((data) => {
        // A refresh renews the desk you are on; it must never move you to
        // another one. It cannot today — we named the desk and the server
        // resolves that slug or refuses — but the whole bug being fixed here
        // was a silent workspace resolution, so this one is checked out loud.
        // citext on the server side, hence the case-insensitive compare.
        const landed = data.workspace?.slug ?? null;
        if (asked && landed && landed.toLowerCase() !== asked.toLowerCase()) {
          throw new ApiError('Session refreshed onto a different workspace', {
            status: 401,
            code: 'WORKSPACE_MISMATCH',
          });
        }

        // Spread the existing session, do NOT rebuild it. setSession assigns
        // wholesale, so listing only the three fields the refresh returns drops
        // everything else on it — in particular `workspace`, which is what puts
        // the X-Workspace-Slug header on every authenticated request. Losing it
        // silently un-names this client every 15 minutes until the next full
        // page load restores it from /auth/me, and on a multi-workspace
        // instance an un-named request is a 403.
        //
        // The server's answer wins over the stored one when it gives one, which
        // is how a session stored before `workspace` existed learns its desk
        // here instead of waiting for the next /auth/me.
        setSession({
          ...session,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
          workspace: data.workspace ?? session.workspace,
        });
        return data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/** The main entry: request('/tickets?view=all-open'), request('/tickets', {method:'POST', body}) */
export async function request(path, opts = {}) {
  try {
    return await rawRequest(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && opts.auth !== false && session?.refreshToken) {
      try {
        await refreshTokens();
      } catch {
        setSession(null);
        onUnauthorized?.();
        throw err;
      }
      return rawRequest(path, opts); // retry once with the fresh token
    }
    throw err;
  }
}

/**
 * Calls a path outside the /api/v1 prefix. `/health` and `/ready` are mounted
 * at the server root, so they can't go through request().
 */
export async function requestRoot(path) {
  const origin = API_URL.replace(/\/api\/v\d+\/?$/, '');
  let res;
  try {
    res = await fetch(`${origin}${path}`);
  } catch {
    throw new ApiError('unreachable', { status: 0 });
  }
  const payload = await parseBody(res);
  if (!res.ok) throw new ApiError('not ok', { status: res.status });
  return payload;
}

export function qs(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}
