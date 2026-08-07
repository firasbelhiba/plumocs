import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { PrincipalThrottlerGuard, resolveTrustedProxies } from './principal-throttler.guard';

/**
 * §8.6 step 1. The point of every IP case below is the same one: nginx builds
 * X-Forwarded-For with $proxy_add_x_forwarded_for, so the caller writes the
 * left of that header and only the rightmost entry is ours.
 */
describe('PrincipalThrottlerGuard', () => {
  const guard = new PrincipalThrottlerGuard(
    { throttlers: [] } as unknown as ThrottlerModuleOptions,
    {} as ThrottlerStorage,
    {} as Reflector,
  );

  /** getTracker is protected; the guard is only ever driven through it. */
  const track = (req: Record<string, unknown>) =>
    (guard as unknown as { getTracker(r: Record<string, unknown>): Promise<string> }).getTracker(req);

  describe('api keys', () => {
    it('buckets each key separately, and never stores the key itself', async () => {
      const tracker = await track({ headers: { 'x-api-key': 'sk_live_abc' }, ip: '203.0.113.9' });
      expect(tracker).toMatch(/^key:[0-9a-f]{32}$/);
      expect(tracker).not.toContain('sk_live_abc');
      expect(await track({ headers: { 'x-api-key': 'sk_live_other' }, ip: '203.0.113.9' })).not.toBe(tracker);
    });

    it('follows the key, not the address it dialled from', async () => {
      const from = (ip: string) => track({ headers: { 'x-api-key': 'sk_live_abc' }, ip });
      expect(await from('203.0.113.9')).toBe(await from('198.51.100.7'));
    });
  });

  describe('anonymous callers', () => {
    it('buckets on the address the framework resolved', async () => {
      expect(await track({ headers: {}, ip: '203.0.113.9' })).toBe('ip:203.0.113.9');
    });

    it('still separates genuinely different clients', async () => {
      expect(await track({ headers: {}, ip: '203.0.113.9' })).not.toBe(await track({ headers: {}, ip: '198.51.100.7' }));
    });

    it('a forged x-forwarded-for does NOT mint a fresh bucket', async () => {
      // What the bypass looked like: one attacker, one real address, a new
      // value in the header every request. Each of these used to produce its
      // own bucket, which made /auth/login's 10/60s meaningless.
      const forged = ['1.2.3.4', '5.6.7.8, 203.0.113.9', '9.9.9.9, 203.0.113.9', '127.0.0.1, 203.0.113.9'];
      const trackers = await Promise.all(
        forged.map((xff) => track({ headers: { 'x-forwarded-for': xff }, ip: '203.0.113.9' })),
      );
      expect(new Set(trackers).size).toBe(1);
      expect(trackers[0]).toBe('ip:203.0.113.9');
    });

    it('ignores x-real-ip too — no header decides the bucket', async () => {
      const tracker = await track({
        headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4' },
        ip: '203.0.113.9',
      });
      expect(tracker).toBe('ip:203.0.113.9');
    });

    it('falls back to the socket, which no header can influence', async () => {
      const tracker = await track({
        headers: { 'x-forwarded-for': '1.2.3.4' },
        socket: { remoteAddress: '198.51.100.7' },
      });
      expect(tracker).toBe('ip:198.51.100.7');
    });

    it('with no address at all, shares one bucket rather than one per caller', async () => {
      expect(await track({ headers: { 'x-forwarded-for': '1.2.3.4' } })).toBe('ip:unknown');
      expect(await track({ headers: { 'x-forwarded-for': '5.6.7.8' } })).toBe('ip:unknown');
    });
  });
});

describe('resolveTrustedProxies', () => {
  it('defaults to loopback — nginx proxies to us over 127.0.0.1', () => {
    expect(resolveTrustedProxies({})).toEqual(['loopback']);
  });

  it('takes a list for proxies that live elsewhere', () => {
    expect(resolveTrustedProxies({ TRUSTED_PROXY_IPS: '10.0.0.0/8, 172.18.0.1' })).toEqual([
      '10.0.0.0/8',
      '172.18.0.1',
    ]);
  });

  it('treats a blank override as unset, never as "trust nobody"', () => {
    // Trusting nobody behind nginx collapses the whole internet onto the
    // proxy's own address: one bucket, and agents eat the 429s.
    expect(resolveTrustedProxies({ TRUSTED_PROXY_IPS: '  , ' })).toEqual(['loopback']);
  });
});

/**
 * The other half of the fix: req.ip is only worth trusting because of how the
 * adapter is constructed in main.ts, so exercise the real adapter with the same
 * option rather than assuming Fastify's resolution.
 */
describe('client address resolution (FastifyAdapter as main.ts builds it)', () => {
  const probe = async (opts: { remoteAddress?: string; xff?: string }) => {
    const instance = new FastifyAdapter({ trustProxy: resolveTrustedProxies() }).getInstance();
    instance.get('/probe', (req, reply) => reply.send({ ip: req.ip }));
    const res = await instance.inject({
      method: 'GET',
      url: '/probe',
      remoteAddress: opts.remoteAddress ?? '127.0.0.1',
      headers: opts.xff ? { 'x-forwarded-for': opts.xff } : {},
    });
    await instance.close();
    return res.json<{ ip: string }>().ip;
  };

  it('behind the proxy, takes the entry nginx appended and not the forged one', async () => {
    expect(await probe({ xff: '1.2.3.4, 203.0.113.9' })).toBe('203.0.113.9');
  });

  it('padding the chain with loopback does not walk the resolution any further left', async () => {
    // Fastify stops at the first hop that is not a trusted proxy, and the
    // attacker's own address — appended by nginx — is that hop.
    expect(await probe({ xff: '1.2.3.4, 127.0.0.1, 127.0.0.1, 203.0.113.9' })).toBe('203.0.113.9');
  });

  it('deployed with nobody in front, the header is ignored entirely', async () => {
    // The case a hop COUNT would have got wrong: no sanitiser upstream, so the
    // socket is the only thing left worth believing.
    expect(await probe({ remoteAddress: '198.51.100.7', xff: '1.2.3.4' })).toBe('198.51.100.7');
  });

  it('unproxied requests still resolve to the peer', async () => {
    expect(await probe({})).toBe('127.0.0.1');
  });
});
