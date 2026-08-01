/**
 * Business-hours math — pure functions, testable in isolation (§9).
 *
 * A schedule is { mon: [["09:00","18:00"]], ... } plus a holiday list
 * (ISO dates) and an IANA timezone. Due times are computed by walking
 * working windows forward and consuming minutes; a null schedule means 24/7.
 */
export interface WeeklySchedule {
  [day: string]: Array<[string, string]>;
}

export interface BusinessCalendar {
  timezone: string;
  weekly: WeeklySchedule;
  holidays: string[]; // ["2026-12-25", ...]
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 86_400_000;

/** Parts of an instant in a given timezone. */
function zoneParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday.toLowerCase().slice(0, 3),
    minutesIntoDay: parseInt(parts.hour === '24' ? '0' : parts.hour, 10) * 60 + parseInt(parts.minute, 10),
  };
}

const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Add `minutes` of working time to `from` under the calendar.
 * With no calendar, it's simple clock arithmetic (24/7 policies).
 * Iterates minute-windows day by day; capped at 400 days as a safety net.
 */
export function addBusinessMinutes(from: Date, minutes: number, calendar: BusinessCalendar | null): Date {
  if (!calendar || minutes <= 0) return new Date(from.getTime() + minutes * 60_000);

  let remaining = minutes;
  // walk in 1-day steps; within each day, consume overlap with working windows
  let cursor = new Date(from.getTime());
  for (let guard = 0; guard < 400; guard++) {
    const { isoDate, weekday } = zoneParts(cursor, calendar.timezone);
    const isHoliday = calendar.holidays.includes(isoDate);
    const windows = isHoliday ? [] : (calendar.weekly[weekday] ?? []);

    for (const [start, end] of windows) {
      // Recompute the position for EVERY window: the cursor moves as we consume
      // time, so a stale value would over-jump into the second window of a day
      // (a lunch-break schedule) by the minutes already spent.
      const { minutesIntoDay: pos } = zoneParts(cursor, calendar.timezone);
      const startM = toMins(start);
      const endM = toMins(end);
      if (endM <= pos) continue; // window already past
      const effectiveStart = Math.max(startM, pos);
      const available = endM - effectiveStart;
      if (available <= 0) continue;
      // jump the cursor to the start of the effective window
      if (effectiveStart > pos) {
        cursor = new Date(cursor.getTime() + (effectiveStart - pos) * 60_000);
      }
      if (remaining <= available) {
        return new Date(cursor.getTime() + remaining * 60_000);
      }
      remaining -= available;
      cursor = new Date(cursor.getTime() + available * 60_000);
    }

    // move to the start of the next local day and keep walking
    const { minutesIntoDay: endOfDayPos } = zoneParts(cursor, calendar.timezone);
    cursor = new Date(cursor.getTime() + (1440 - endOfDayPos) * 60_000);
    cursor = new Date(Math.floor(cursor.getTime() / 60_000) * 60_000);
  }
  // pathological schedule (no working windows at all) — fall back to clock time
  return new Date(from.getTime() + minutes * 60_000);
}

/**
 * Business minutes between two instants. Used to extend SLA due times after a
 * pause: a pause across a weekend consumed no business time, so the deadline
 * should not move — extending by wall-clock would hand out free days.
 */
export function businessMinutesBetween(from: Date, to: Date, calendar: BusinessCalendar | null): number {
  const spanMins = Math.max(0, (to.getTime() - from.getTime()) / 60_000);
  if (!calendar || spanMins === 0) return spanMins;

  let total = 0;
  let cursor = new Date(from.getTime());
  for (let guard = 0; guard < 400 && cursor < to; guard++) {
    const { isoDate, weekday } = zoneParts(cursor, calendar.timezone);
    const windows = calendar.holidays.includes(isoDate) ? [] : (calendar.weekly[weekday] ?? []);

    for (const [start, end] of windows) {
      const { minutesIntoDay: pos } = zoneParts(cursor, calendar.timezone);
      const endM = toMins(end);
      if (endM <= pos) continue;
      const effectiveStart = Math.max(toMins(start), pos);
      const windowStartAt = new Date(cursor.getTime() + (effectiveStart - pos) * 60_000);
      if (windowStartAt >= to) return total;
      const windowEndAt = new Date(cursor.getTime() + (endM - pos) * 60_000);
      const sliceEnd = windowEndAt < to ? windowEndAt : to;
      total += Math.max(0, (sliceEnd.getTime() - windowStartAt.getTime()) / 60_000);
      cursor = sliceEnd;
      if (cursor >= to) return total;
    }

    const { minutesIntoDay: endOfDayPos } = zoneParts(cursor, calendar.timezone);
    cursor = new Date(cursor.getTime() + (1440 - endOfDayPos) * 60_000);
    cursor = new Date(Math.floor(cursor.getTime() / 60_000) * 60_000);
  }
  return total;
}

/** DAY_KEYS/DAY_MS retained for schedule helpers/tests. */
export const __internal = { DAY_KEYS, DAY_MS, zoneParts, toMins };
