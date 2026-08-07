import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

/**
 * The upstream hops Fastify may believe about a client's address.
 *
 * Lives next to the guard rather than in main.ts because the tracker below is
 * only sound while it is applied: the guard buckets anonymous callers on
 * req.ip, and req.ip is precisely what this list decides. Kept apart the two
 * drift, and the drift is silent — nothing fails, every rate limit just quietly
 * stops holding.
 *
 * Loopback by default, and that covers BOTH deployments we actually run: nginx
 * is native on the same host either way, proxying to 127.0.0.1:3002, and the
 * containers join that same namespace with `network_mode: host` — so the peer
 * is loopback there too. Do not set the override for the containerised
 * deployment; naming a bridge CIDR while nginx still arrives on loopback makes
 * the real hop untrusted, and then req.ip is 127.0.0.1 for the entire internet.
 *
 * TRUSTED_PROXY_IPS is for a topology we do not have yet — a proxy on another
 * host, or containers moved onto a bridge network. Comma-separated addresses or
 * CIDRs, or the proxy-addr range names loopback / linklocal / uniquelocal.
 */
export function resolveTrustedProxies(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.TRUSTED_PROXY_IPS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  // An empty override must not mean "trust nobody": behind nginx that collapses
  // every anonymous caller onto the proxy's address, i.e. one shared bucket for
  // the whole internet, and the console starts 429ing for no visible reason.
  return configured.length ? configured : ['loopback'];
}

/**
 * Rate limits each API key separately, and each IP separately.
 *
 * The stock guard buckets by IP alone. Every request from a partner's backend
 * shares one address, so a single busy chatbot consumes the whole desk's budget
 * and the console starts returning 429 to agents — a third party's traffic
 * taking down first-party staff.
 *
 * Keying on the credential fixes that: one chatbot flooding only exhausts its
 * own bucket.
 *
 * WHY NOT JUST READ `req.principal`: guards run in declaration order and the
 * throttler runs FIRST, before AuthGuard, so no principal exists yet. That order
 * is deliberate — moving the throttler after authentication would leave
 * unauthenticated routes, login included, with no brute-force protection at all.
 * The raw header is available at this point and is exactly as identifying.
 *
 * The header is hashed before use. An unverified secret sitting in the
 * throttler's in-memory store, in log lines and in heap dumps is a needless
 * place for a credential to appear, and the tracker only needs a stable
 * discriminator rather than the value itself.
 */
@Injectable()
export class PrincipalThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
    const raw = headers['x-api-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;

    if (typeof key === 'string' && key.length > 0) {
      // Not verified here — an invalid key gets its own bucket too, which is
      // correct: someone spraying bad credentials should be limited on what
      // they sent, not share a bucket with everyone behind the same proxy.
      return `key:${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
    }

    // Anonymous callers bucket by address, and the address MUST come from the
    // framework. This used to read x-forwarded-for[0], but nginx builds that
    // header with $proxy_add_x_forwarded_for, which appends the real peer to
    // whatever the caller sent — so element [0] was pure attacker input and a
    // fresh value per request minted a fresh bucket per request. Every limit
    // was bypassable, including /auth/login's 10/60s and the global 120/60s
    // that is the only thing standing in front of the public PM sign-in routes.
    //
    // req.ip, not x-real-ip: both are trustworthy behind our nginx (it sets
    // X-Real-IP from $remote_addr with proxy_set_header, which overwrites any
    // client value), but X-Real-IP is a plain forgeable header the moment this
    // process is reachable without that vhost in front. req.ip degrades to the
    // socket address instead — see resolveTrustedProxies above and main.ts.
    const ip = (req as { ip?: unknown }).ip;
    if (typeof ip === 'string' && ip.length > 0) return `ip:${ip}`;

    // No req.ip means this is not a Fastify HTTP request (or trustProxy failed
    // to resolve one). Fall back to the socket, which no header can influence,
    // and finally to a single shared bucket — over-throttling a handful of
    // callers is the safe direction to fail.
    const socket = (req as { socket?: { remoteAddress?: string } }).socket;
    return `ip:${socket?.remoteAddress || 'unknown'}`;
  }
}
