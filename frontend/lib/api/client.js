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

async function rawRequest(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
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
        // Older sessions stored before this shipped have no workspace, so this
        // stays absent and the server falls back exactly as before.
        ...(auth && session?.workspace?.slug ? { 'x-workspace-slug': session.workspace.slug } : {}),
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
    refreshing = rawRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
      auth: false,
    })
      .then((data) => {
        setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
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
