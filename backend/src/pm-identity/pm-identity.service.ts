import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
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
    userId: string;
    workspaceId?: string | null;
    returnTo?: string | null;
  }): Promise<string> {
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
        userId: input.userId,
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
    return url.toString();
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
    userId: string;
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
      userId: row.userId,
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

  private assertEnabled(): void {
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
