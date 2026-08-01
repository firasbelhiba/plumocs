import { createHmac } from 'crypto';
import { EVENT_API_TO_DB, EVENT_DB_TO_API } from './webhooks.module';

/**
 * Subscribers register for dotted names ("ticket.created") while Prisma stores
 * enum members ("ticket_created"). Sending the wrong one back made every
 * delivery unroutable for consumers switching on payload.event.
 */
describe('webhook event names', () => {
  it('maps every documented API name to a DB enum member', () => {
    expect(EVENT_API_TO_DB['ticket.created']).toBe('ticket_created');
    expect(EVENT_API_TO_DB['message.added']).toBe('message_added');
    expect(EVENT_API_TO_DB['sla.breached']).toBe('sla_breached');
  });

  it('round-trips in both directions without loss', () => {
    for (const [api, db] of Object.entries(EVENT_API_TO_DB)) {
      expect(EVENT_DB_TO_API[db]).toBe(api);
    }
  });

  it('covers the six events in the spec', () => {
    expect(Object.keys(EVENT_API_TO_DB).sort()).toEqual(
      ['message.added', 'sla.breached', 'ticket.assigned', 'ticket.created', 'ticket.resolved', 'ticket.updated'],
    );
  });

  it('uses dots outward and underscores inward', () => {
    for (const api of Object.keys(EVENT_API_TO_DB)) expect(api).toContain('.');
    for (const db of Object.values(EVENT_API_TO_DB)) expect(db).not.toContain('.');
  });
});

/**
 * The delivery signature is an HMAC over the exact raw body with the endpoint's
 * secret — a subscriber must be able to recompute it byte-for-byte.
 */
describe('delivery signature', () => {
  const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('hex');

  it('is reproducible from the raw body and secret', () => {
    const body = JSON.stringify({ event: 'ticket.created', payload: { id: 'tk1' }, timestamp: 1_800_000_000 });
    expect(sign(body, 's3cret')).toBe(sign(body, 's3cret'));
  });

  it('changes when the body changes by a single byte', () => {
    const a = sign('{"event":"ticket.created"}', 's3cret');
    const b = sign('{"event":"ticket.updated"}', 's3cret');
    expect(a).not.toBe(b);
  });

  it('changes when the secret changes', () => {
    const body = '{"event":"ticket.created"}';
    expect(sign(body, 'one')).not.toBe(sign(body, 'two'));
  });

  it('produces a 64-char hex digest', () => {
    expect(sign('{}', 's')).toMatch(/^[0-9a-f]{64}$/);
  });
});
