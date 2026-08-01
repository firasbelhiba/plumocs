import { SlaService } from './sla.service';

/** Unit test on the pure pause/resume timer logic — no DB. */
describe('SLA pause/resume timers', () => {
  const sla = new SlaService(null as never);

  const base = {
    slaPausedAt: null as Date | null,
    firstResponseDueAt: new Date('2026-07-29T12:00:00Z'),
    resolutionDueAt: new Date('2026-07-30T12:00:00Z'),
  };

  it('entering pending pauses the clock', () => {
    const now = new Date('2026-07-29T10:00:00Z');
    const patch = sla.timerPatchForTransition(base, 'pending', now);
    expect(patch.slaPausedAt).toEqual(now);
    expect(patch.firstResponseDueAt).toBeUndefined();
  });

  it('entering on_hold pauses the clock', () => {
    const now = new Date('2026-07-29T10:00:00Z');
    const patch = sla.timerPatchForTransition(base, 'on_hold', now);
    expect(patch.slaPausedAt).toEqual(now);
  });

  it('returning to open adds the paused duration to both due times', () => {
    const pausedAt = new Date('2026-07-29T10:00:00Z');
    const now = new Date('2026-07-29T11:30:00Z'); // paused 90 minutes
    const patch = sla.timerPatchForTransition({ ...base, slaPausedAt: pausedAt }, 'open', now);
    expect(patch.slaPausedAt).toBeNull();
    expect(patch.firstResponseDueAt).toEqual(new Date('2026-07-29T13:30:00Z'));
    expect(patch.resolutionDueAt).toEqual(new Date('2026-07-30T13:30:00Z'));
  });

  it('does not double-pause an already paused ticket', () => {
    const pausedAt = new Date('2026-07-29T10:00:00Z');
    const patch = sla.timerPatchForTransition({ ...base, slaPausedAt: pausedAt }, 'on_hold', new Date('2026-07-29T11:00:00Z'));
    expect(patch.slaPausedAt).toBeUndefined();
  });

  it('stamps resolved_at and closed_at', () => {
    const now = new Date('2026-07-29T15:00:00Z');
    expect(sla.timerPatchForTransition(base, 'resolved', now).resolvedAt).toEqual(now);
    expect(sla.timerPatchForTransition(base, 'closed', now).closedAt).toEqual(now);
  });

  describe('with a business-hours calendar', () => {
    const CAL = {
      timezone: 'UTC',
      weekly: {
        mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']],
        thu: [['09:00', '17:00']], fri: [['09:00', '17:00']], sat: [], sun: [],
      },
      holidays: [],
    } as const;

    it('a weekend pause does not move the deadline at all', () => {
      const pausedAt = new Date('2026-07-31T18:00:00Z'); // Friday, after hours
      const now = new Date('2026-08-03T08:00:00Z'); // Monday, before hours
      const ticket = {
        slaPausedAt: pausedAt,
        firstResponseDueAt: new Date('2026-08-03T10:00:00Z'),
        resolutionDueAt: new Date('2026-08-04T10:00:00Z'),
      };
      const patch = sla.timerPatchForTransition(ticket, 'open', now, CAL as never);
      // wall-clock would have added ~62 hours of free time
      expect(patch.firstResponseDueAt).toEqual(ticket.firstResponseDueAt);
      expect(patch.resolutionDueAt).toEqual(ticket.resolutionDueAt);
      expect(patch.slaPausedAt).toBeNull();
    });

    it('an in-hours pause extends by exactly the business time consumed', () => {
      const pausedAt = new Date('2026-07-29T10:00:00Z'); // Wednesday
      const now = new Date('2026-07-29T12:00:00Z'); // two working hours later
      const ticket = {
        slaPausedAt: pausedAt,
        firstResponseDueAt: new Date('2026-07-29T14:00:00Z'),
        resolutionDueAt: null,
      };
      const patch = sla.timerPatchForTransition(ticket, 'open', now, CAL as never);
      expect(patch.firstResponseDueAt).toEqual(new Date('2026-07-29T16:00:00Z'));
    });

    it('falls back to wall-clock for a 24/7 policy (no calendar)', () => {
      const pausedAt = new Date('2026-07-31T18:00:00Z');
      const now = new Date('2026-08-03T08:00:00Z');
      const ticket = {
        slaPausedAt: pausedAt,
        firstResponseDueAt: new Date('2026-08-03T10:00:00Z'),
        resolutionDueAt: null,
      };
      const patch = sla.timerPatchForTransition(ticket, 'open', now, null);
      const expected = new Date(ticket.firstResponseDueAt.getTime() + (now.getTime() - pausedAt.getTime()));
      expect(patch.firstResponseDueAt).toEqual(expected);
    });
  });
});
