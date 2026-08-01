import { UnprocessableEntityException } from '@nestjs/common';
import { assertTransition, isReopen, TICKET_TRANSITIONS } from './ticket-state-machine';

describe('ticket state machine', () => {
  it('allows the documented happy path', () => {
    expect(() => assertTransition('new', 'open')).not.toThrow();
    expect(() => assertTransition('open', 'pending')).not.toThrow();
    expect(() => assertTransition('pending', 'open')).not.toThrow();
    expect(() => assertTransition('open', 'resolved')).not.toThrow();
    expect(() => assertTransition('resolved', 'closed')).not.toThrow();
  });

  it('allows on_hold detour and return', () => {
    expect(() => assertTransition('open', 'on_hold')).not.toThrow();
    expect(() => assertTransition('on_hold', 'open')).not.toThrow();
  });

  it('allows reopening resolved and closed tickets', () => {
    expect(() => assertTransition('resolved', 'open')).not.toThrow();
    expect(() => assertTransition('closed', 'open')).not.toThrow();
    expect(isReopen('resolved', 'open')).toBe(true);
    expect(isReopen('closed', 'open')).toBe(true);
    expect(isReopen('pending', 'open')).toBe(false);
  });

  it('rejects illegal transitions with 422', () => {
    expect(() => assertTransition('closed', 'pending')).toThrow(UnprocessableEntityException);
    expect(() => assertTransition('closed', 'resolved')).toThrow(UnprocessableEntityException);
    expect(() => assertTransition('resolved', 'pending')).toThrow(UnprocessableEntityException);
    expect(() => assertTransition('resolved', 'new')).toThrow(UnprocessableEntityException);
    expect(() => assertTransition('open', 'new')).toThrow(UnprocessableEntityException);
  });

  it('treats same-state transitions as a no-op', () => {
    for (const status of Object.keys(TICKET_TRANSITIONS)) {
      expect(() => assertTransition(status as never, status as never)).not.toThrow();
    }
  });
});
