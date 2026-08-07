import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Plumo CS as an OAuth client of Plumo PM.
 *
 * PM runs a spec-compliant OAuth 2.1 authorization server with dynamic client
 * registration and PKCE, so CS registers itself and drives a standard
 * authorization-code flow. Nothing here is bespoke to PM beyond the issuer URL.
 *
 * WHAT THIS IS FOR: learning who a person is on the PM side, and which PM
 * workspaces they belong to, so a CS user can be linked to a PM account and a
 * CS desk to a PM workspace. It is not a session mechanism — CS issues its own
 * tokens as it always has. This only establishes the link.
 */

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  userinfo_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export interface PmUserInfo {
  sub: string;
  email: string;
  name: string;
  workspaces: Array<{ id: string; slug: string; name: string; roleId: string }>;
}

/**
 * The half of a sign-in that stays in the browser.
 *
 * A LINK names its user in the state row, so the callback can only ever apply
 * the identity to the person who started it. A SIGN-IN names nobody — the whole
 * point is that there is no session yet — which left the state row as the only
 * credential, and a state row belongs to whoever called /signin. Attacker starts
 * a flow, authorises it against their own PM account, stops before the callback,
 * then hands the victim `?code=…&state=…`: the victim's console adopts the
 * attacker's session and everything they type from then on lands in an inbox the
 * attacker can read.
 *
 * The fix is a second half the attacker cannot write into the victim's browser,
 * compared against the state on the way back.
 */
const SIGNIN_STATE_COOKIE = 'pm_signin_state';

/** Matches the state row's TTL; a binding that outlives its row is dead weight. */
const SIGNIN_STATE_COOKIE_MAX_AGE_SECS = 10 * 60;

@Injectable()
export class PmIdentityService {
  private readonly logger = new Logger(PmIdentityService.name);
  private discovery?: Promise<DiscoveryDocument>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return !!this.issuer && !!this.redirectUri;
  }

  private get issuer(): string {
    return (this.config.get<string>('pm.issuer') ?? '').replace(/\/+$/, '');
  }

  private get redirectUri(): string {
    return this.config.get<string>('pm.redirectUri') ?? '';
  }

  /**
   * The scopes CS asks for.
   *
   * `mcp:read` is here under protest. PM's parseScopes currently requires it on
   * every grant, so an identity-only request is rejected at /authorize even
   * though PM's own identity guard accepts identity-only tokens. Until that is
   * relaxed, CS holds read access to project data it neither wants nor uses —
   * so this stays a named constant, easy to find and shorten on the day PM
   * allows it.
   */
  private get scopes(): string {
    return 'identity:read mcp:read';
  }

  // ---- discovery ------------------------------------------------------------

  /**
   * Endpoints are discovered, never hardcoded. Memoised on success only: a
   * cached rejection would turn one network blip into an outage that outlives
   * the blip.
   */
  private async discover(): Promise<DiscoveryDocument> {
    if (!this.discovery) {
      this.discovery = this.fetchDiscovery().catch((err) => {
        this.discovery = undefined;
        throw err;
      });
    }
    return this.discovery;
  }

  private async fetchDiscovery(): Promise<DiscoveryDocument> {
    const url = `${this.issuer}/.well-known/oauth-authorization-server`;
    const res = await this.fetchJson<DiscoveryDocument>(url, { method: 'GET' });
    if (!res.authorization_endpoint || !res.token_endpoint) {
      throw new ServiceUnavailableException('Plumo returned an incomplete discovery document');
    }
    // The flow below sends a code_challenge and no client secret. If the server
    // ever stops supporting S256, failing here is far clearer than a rejected
    // authorization later.
    if (res.code_challenge_methods_supported && !res.code_challenge_methods_supported.includes('S256')) {
      throw new ServiceUnavailableException('Plumo does not support PKCE S256');
    }
    return res;
  }

  // ---- registration ---------------------------------------------------------

  /**
   * The client_id for this deployment, registering on first use.
   *
   * Persisted rather than re-registered per boot: PM issues a fresh client each
   * time, and every one shows up in the user's list of authorised applications.
   * One registration, reused.
   */
  private async clientId(): Promise<string> {
    const existing = await this.prisma.pmOAuthClient.findUnique({
      where: { issuer_redirectUri: { issuer: this.issuer, redirectUri: this.redirectUri } },
    });
    if (existing) return existing.clientId;

    const doc = await this.discover();
    if (!doc.registration_endpoint) {
      throw new ServiceUnavailableException(
        'Plumo does not advertise dynamic client registration; a client_id must be configured manually',
      );
    }

    const registered = await this.fetchJson<{ client_id: string }>(doc.registration_endpoint, {
      method: 'POST',
      body: {
        client_name: 'Plumo CS',
        redirect_uris: [this.redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: this.scopes,
      },
    });
    if (!registered.client_id) {
      throw new ServiceUnavailableException('Plumo registration returned no client_id');
    }

    // upsert, not create: two workers racing the first login must not leave two
    // registrations for one deployment. The unique key is the arbiter.
    const row = await this.prisma.pmOAuthClient.upsert({
      where: { issuer_redirectUri: { issuer: this.issuer, redirectUri: this.redirectUri } },
      create: {
        issuer: this.issuer,
        redirectUri: this.redirectUri,
        clientId: registered.client_id,
        scopes: this.scopes,
      },
      update: {},
    });
    this.logger.log(`Registered Plumo CS with ${this.issuer} as client ${row.clientId}`);
    return row.clientId;
  }

  // ---- the flow -------------------------------------------------------------

  /**
   * Where to send the browser, and the state row that remembers the rest.
   *
   * The code_verifier is stored server-side and never leaves it. Sending it via
   * a cookie would hand the browser the one secret PKCE exists to keep out of
   * it — see the schema comment on pm_oauth_states.
   */
  async beginAuthorization(input: {
    /** Set to link this PM identity to that CS user; null to sign in with it. */
    userId: string | null;
    workspaceId?: string | null;
    returnTo?: string | null;
  }): Promise<{ url: string; state: string }> {
    this.assertEnabled();
    const doc = await this.discover();
    const clientId = await this.clientId();

    // 43-128 chars of unreserved characters, per RFC 7636. 32 random bytes
    // base64url-encoded lands at 43.
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state = randomBytes(32).toString('base64url');

    await this.prisma.pmOAuthState.create({
      data: {
        state,
        codeVerifier,
        userId: input.userId ?? null,
        workspaceId: input.workspaceId ?? null,
        returnTo: input.returnTo ?? null,
        // Long enough to read a consent screen, short enough that an abandoned
        // flow is not a standing credential.
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });

    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', this.scopes);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // PM binds tokens to a resource; naming it is what makes the audience check
    // on the other side pass.
    url.searchParams.set('resource', `${this.issuer}/mcp`);
    // The state comes back out so the caller can bind it to the browser. It is
    // not a secret in the PKCE sense — it travels through PM in a query string —
    // which is exactly why it needs a browser-held copy to mean anything.
    return { url: url.toString(), state };
  }

  // ---- browser binding ------------------------------------------------------

  /**
   * Where the console sends the browser to BEGIN a sign-in.
   *
   * A hop through this api rather than straight to PM, because the binding
   * cookie has to be set somewhere the browser will keep it. The console is a
   * different origin and its fetch() sends no credentials, so a Set-Cookie on
   * the /signin JSON response is discarded before it is ever stored. A top-level
   * navigation to this api is not.
   *
   * Derived from the registered redirect URI and never from APP_URL: the hop and
   * the callback must agree on origin AND path prefix, or the cookie one sets is
   * not the cookie the other is sent.
   */
  get signInRedirectUrl(): string {
    this.assertEnabled();
    const u = new URL(this.redirectUri);
    u.search = '';
    u.hash = '';
    u.pathname = `${this.cookiePath === '/' ? '' : this.cookiePath}/signin/redirect`;
    return u.toString();
  }

  /**
   * The Set-Cookie header binding a sign-in to this browser.
   *
   * WRITTEN BY HAND ON PURPOSE. No cookie plugin is registered on the Fastify
   * adapter — @fastify/cookie is not a dependency of this project — and pulling
   * one in to write a single header would be the larger change.
   *
   * SameSite=Lax, not Strict: the callback arrives as a top-level GET navigation
   * from PM's origin. Lax sends the cookie on exactly that; Strict would drop it
   * and every sign-in would be refused as a mismatch.
   */
  signInBindingCookie(state: string): string {
    return this.buildSignInCookie(state, SIGNIN_STATE_COOKIE_MAX_AGE_SECS);
  }

  /** The same cookie, expired. Sent on every terminal outcome, success included. */
  clearedSignInBindingCookie(): string {
    return this.buildSignInCookie('', 0);
  }

  /**
   * Did this browser start the sign-in it is coming back from?
   *
   * Constant-time, after a length check — timingSafeEqual throws on unequal
   * lengths rather than returning false.
   */
  signInStateMatches(cookieHeader: string | undefined, state: string | undefined): boolean {
    const bound = this.readCookie(cookieHeader, SIGNIN_STATE_COOKIE);
    if (!bound || !state || bound.length !== state.length) return false;
    return timingSafeEqual(Buffer.from(bound), Buffer.from(state));
  }

  /**
   * The directory the callback lives in — the narrowest Path the cookie can
   * carry and still be sent back to it. Scoping it here keeps the binding off
   * every other request this api serves.
   */
  private get cookiePath(): string {
    // Unparseable means PM is not configured, and redirectUri is '' — for which
    // `new URL` throws rather than returning anything. The callback is @Public()
    // and reachable on such a deployment, and its failure path clears this
    // cookie before redirecting, so throwing here turns a tidy "that link was
    // incomplete" bounce back to the console into a 500 on a blank api page.
    // The value is immaterial in that state: there is no sign-in to bind, and
    // clearing a cookie that was never set is a no-op at any Path.
    try {
      const dir = new URL(this.redirectUri).pathname.replace(/\/+$/, '').replace(/\/[^/]*$/, '');
      return dir || '/';
    } catch {
      return '/';
    }
  }

  private buildSignInCookie(value: string, maxAgeSecs: number): string {
    const parts = [
      `${SIGNIN_STATE_COOKIE}=${value}`,
      `Path=${this.cookiePath}`,
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSecs}`,
    ];
    // Follows the scheme we actually redirect to rather than NODE_ENV: a Secure
    // cookie is silently dropped over plain http, so a local deployment would
    // refuse every sign-in as a mismatch and it would read as a bug in the check
    // rather than as a missing cookie.
    if (this.redirectUri.startsWith('https://')) parts.push('Secure');
    return parts.join('; ');
  }

  private readCookie(header: string | undefined, name: string): string | null {
    for (const pair of (header ?? '').split(';')) {
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      if (pair.slice(0, eq).trim() !== name) continue;
      return decodeURIComponent(pair.slice(eq + 1).trim());
    }
    return null;
  }

  /**
   * Exchange the callback for an access token, then resolve who it belongs to.
   *
   * The state row is consumed atomically: `updateMany` with `consumedAt: null`
   * in the filter means a replayed callback updates zero rows and is refused.
   * Checking-then-writing would leave a window where two concurrent callbacks
   * both pass.
   */
  async completeAuthorization(input: { code: string; state: string }): Promise<{
    userInfo: PmUserInfo;
    /** Null when this was a sign-in rather than a link. */
    userId: string | null;
    workspaceId: string | null;
    returnTo: string | null;
  }> {
    this.assertEnabled();

    const claimed = await this.prisma.pmOAuthState.updateMany({
      where: { state: input.state, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) {
      // One message for unknown, expired and already-used. The caller can do
      // nothing different for each, and distinguishing them tells an attacker
      // which of their guesses was closest.
      throw new BadRequestException('This sign-in link is no longer valid. Please try again.');
    }
    const row = await this.prisma.pmOAuthState.findUnique({ where: { state: input.state } });
    if (!row) throw new BadRequestException('This sign-in link is no longer valid. Please try again.');

    const doc = await this.discover();
    const clientId = await this.clientId();

    const token = await this.fetchJson<{ access_token: string; scope?: string }>(doc.token_endpoint, {
      method: 'POST',
      form: {
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: this.redirectUri,
        client_id: clientId,
        code_verifier: row.codeVerifier,
        resource: `${this.issuer}/mcp`,
      },
    });
    if (!token.access_token) {
      throw new ServiceUnavailableException('Plumo returned no access token');
    }

    if (!doc.userinfo_endpoint) {
      throw new ServiceUnavailableException('Plumo does not advertise a userinfo endpoint');
    }
    const userInfo = await this.fetchJson<PmUserInfo>(doc.userinfo_endpoint, {
      method: 'GET',
      bearer: token.access_token,
    });
    if (!userInfo.sub) {
      throw new ServiceUnavailableException('Plumo returned no subject for this user');
    }

    return {
      userInfo,
      // Null here means the flow began at the login screen, with nobody signed
      // in — the caller resolves the user from the PM subject instead.
      userId: row.userId ?? null,
      workspaceId: row.workspaceId,
      returnTo: row.returnTo,
    };
  }

  /** Expired and consumed rows are worthless; the verifier is a secret with no reason to linger. */
  async pruneExpiredStates(): Promise<number> {
    const { count } = await this.prisma.pmOAuthState.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 60 * 60_000) } },
    });
    return count;
  }

  // ---- plumbing -------------------------------------------------------------

  /** Public so a caller can refuse cheaply, without a state row or a round trip. */
  assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Plumo sign-in is not configured on this deployment (PM_ISSUER / PM_REDIRECT_URI)',
      );
    }
  }

  private async fetchJson<T>(
    url: string,
    init: { method: 'GET' | 'POST'; body?: unknown; form?: Record<string, string>; bearer?: string },
  ): Promise<T> {
    const controller = new AbortController();
    // A hung identity provider must not hold a request open indefinitely.
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: init.method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(init.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: init.body
          ? JSON.stringify(init.body)
          : init.form
            ? new URLSearchParams(init.form).toString()
            : undefined,
      });
      const text = await res.text();
      if (!res.ok) {
        // Log the provider's own error, return a generic one. Their error
        // strings are for us, not for whoever is signing in.
        this.logger.warn(`Plumo ${init.method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
        throw new ServiceUnavailableException('Plumo rejected the sign-in request');
      }
      return JSON.parse(text) as T;
    } catch (err) {
      if (err instanceof ServiceUnavailableException || err instanceof BadRequestException) throw err;
      this.logger.warn(`Plumo ${init.method} ${url} failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not reach Plumo');
    } finally {
      clearTimeout(timer);
    }
  }
}
