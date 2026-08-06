import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

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

    // Behind nginx, req.ip is the proxy without trustProxy; x-forwarded-for is
    // set by our own vhost and is the only hop we control.
    const fwd = headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    return `ip:${first || (req as { ip?: string }).ip || 'unknown'}`;
  }
}
