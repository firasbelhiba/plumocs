import { businessMinutesBetween, type BusinessCalendar } from './business-hours.util';

const CAL: BusinessCalendar = {
  timezone: 'UTC',
  weekly: {
    mon: [['09:00', '17:00']],
    tue: [['09:00', '17:00']],
    wed: [['09:00', '17:00']],
    thu: [['09:00', '17:00']],
    fri: [['09:00', '17:00']],
    sat: [],
    sun: [],
  },
  holidays: ['2026-12-25'],
};

/**
 * Used to extend SLA due times after a pause. Extending by wall-clock instead
 * handed out free days whenever a ticket sat "pending" over a weekend.
 */
describe('businessMinutesBetween', () => {
  it('counts plain wall-clock when there is no calendar (24/7 policy)', () => {
    const from = new Date('2026-07-29T10:00:00Z');
    const to = new Date('2026-07-29T12:30:00Z');
    expect(businessMinutesBetween(from, to, null)).toBe(150);
  });

  it('counts minutes inside one working window', () => {
    const from = new Date('2026-07-29T10:00:00Z'); // Wednesday
    const to = new Date('2026-07-29T12:00:00Z');
    expect(businessMinutesBetween(from, to, CAL)).toBe(120);
  });

  it('ignores time outside the window', () => {
    // 16:00 → 20:00, only 16:00–17:00 counts
    const from = new Date('2026-07-29T16:00:00Z');
    const to = new Date('2026-07-29T20:00:00Z');
    expect(businessMinutesBetween(from, to, CAL)).toBe(60);
  });

  // the regression: pausing on Friday evening and resuming Monday morning
  it('counts nothing across a weekend', () => {
    const fri = new Date('2026-07-31T18:00:00Z'); // after hours Friday
    const mon = new Date('2026-08-03T08:00:00Z'); // before hours Monday
    expect(businessMinutesBetween(fri, mon, CAL)).toBe(0);
  });

  it('counts only the working slice of a weekend-spanning pause', () => {
    const fri = new Date('2026-07-31T16:00:00Z'); // 1h of Friday left
    const mon = new Date('2026-08-03T10:00:00Z'); // 1h into Monday
    expect(businessMinutesBetween(fri, mon, CAL)).toBe(120);
  });

  it('skips holidays', () => {
    const thu = new Date('2026-12-24T16:00:00Z'); // 1h left on the 24th
    const mon = new Date('2026-12-28T10:00:00Z'); // 25th holiday, 26–27 weekend
    expect(businessMinutesBetween(thu, mon, CAL)).toBe(120);
  });

  it('is zero for a reversed or empty range', () => {
    const t = new Date('2026-07-29T10:00:00Z');
    expect(businessMinutesBetween(t, t, CAL)).toBe(0);
    expect(businessMinutesBetween(new Date('2026-07-29T12:00:00Z'), t, CAL)).toBe(0);
  });

  it('accumulates across several working days', () => {
    // Wed 09:00 → Fri 17:00 = three full 8h days
    const from = new Date('2026-07-29T09:00:00Z');
    const to = new Date('2026-07-31T17:00:00Z');
    expect(businessMinutesBetween(from, to, CAL)).toBe(3 * 8 * 60);
  });

  it('handles a lunch-break schedule', () => {
    const split: BusinessCalendar = {
      timezone: 'UTC',
      weekly: { mon: [['09:00', '12:00'], ['13:00', '18:00']], sat: [], sun: [] },
      holidays: [],
    };
    // Mon 11:00 → 14:00 spans the break: 60 + 60 minutes count, the hour off does not
    const from = new Date('2026-08-03T11:00:00Z');
    const to = new Date('2026-08-03T14:00:00Z');
    expect(businessMinutesBetween(from, to, split)).toBe(120);
  });
});
