import { addBusinessMinutes, BusinessCalendar } from './business-hours.util';

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

describe('addBusinessMinutes', () => {
  it('is plain clock arithmetic with no calendar (24/7 policies)', () => {
    const from = new Date('2026-07-29T10:00:00Z');
    expect(addBusinessMinutes(from, 90, null).toISOString()).toBe('2026-07-29T11:30:00.000Z');
  });

  it('consumes minutes inside a working window', () => {
    // Wednesday 10:00 UTC + 120 working minutes -> 12:00 the same day
    const from = new Date('2026-07-29T10:00:00Z'); // a Wednesday
    const due = addBusinessMinutes(from, 120, CAL);
    expect(due.toISOString()).toBe('2026-07-29T12:00:00.000Z');
  });

  it('spills into the next working day when the window closes', () => {
    // Wednesday 16:30 + 60m: 30m today (to 17:00), 30m Thursday from 09:00 -> 09:30
    const from = new Date('2026-07-29T16:30:00Z');
    const due = addBusinessMinutes(from, 60, CAL);
    expect(due.toISOString()).toBe('2026-07-30T09:30:00.000Z');
  });

  it('skips weekends', () => {
    // Friday 16:00 + 120m: 60m Friday (to 17:00), 60m Monday from 09:00 -> 10:00
    const from = new Date('2026-07-31T16:00:00Z'); // a Friday
    const due = addBusinessMinutes(from, 120, CAL);
    expect(due.toISOString()).toBe('2026-08-03T10:00:00.000Z'); // Monday
  });

  it('starts counting at the window opening when created out of hours', () => {
    // Wednesday 06:00 + 30m -> 09:30 same day
    const from = new Date('2026-07-29T06:00:00Z');
    const due = addBusinessMinutes(from, 30, CAL);
    expect(due.toISOString()).toBe('2026-07-29T09:30:00.000Z');
  });

  it('handles a lunch break correctly (multi-window day)', () => {
    const split: BusinessCalendar = {
      timezone: 'UTC',
      weekly: { mon: [['09:00', '12:00'], ['13:00', '18:00']], tue: [['09:00', '18:00']], sat: [], sun: [] },
      holidays: [],
    };
    // Mon 09:00 + 240 business minutes: 180 before lunch, 60 after 13:00 → 14:00
    const from = new Date('2026-08-03T09:00:00Z'); // a Monday
    expect(addBusinessMinutes(from, 240, split).toISOString()).toBe('2026-08-03T14:00:00.000Z');
  });

  it('spills across a lunch break into the next day', () => {
    const split: BusinessCalendar = {
      timezone: 'UTC',
      weekly: { mon: [['09:00', '12:00'], ['13:00', '18:00']], tue: [['09:00', '18:00']], sat: [], sun: [] },
      holidays: [],
    };
    // Mon 09:00 + 500: 180 (to 12:00) + 300 (13:00–18:00) = 480, 20 left → Tue 09:20
    const from = new Date('2026-08-03T09:00:00Z');
    expect(addBusinessMinutes(from, 500, split).toISOString()).toBe('2026-08-04T09:20:00.000Z');
  });

  it('skips holidays', () => {
    // Thursday 24 Dec 16:30 + 60m: 30m today; 25 Dec is a holiday; sat/sun off
    // -> Monday 28 Dec 09:30
    const from = new Date('2026-12-24T16:30:00Z'); // a Thursday
    const due = addBusinessMinutes(from, 60, CAL);
    expect(due.toISOString()).toBe('2026-12-28T09:30:00.000Z');
  });
});
