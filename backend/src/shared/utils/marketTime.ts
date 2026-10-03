/**
 * Single source of truth for "what time is it in the marketplace".
 *
 * working hours ({ open: 'HH:mm', close: 'HH:mm' } per weekday) are entered
 * by sellers as *local market time*. The server may run in UTC (Railway,
 * Docker defaults), so every comparison against working hours must go
 * through these helpers instead of Date#getHours()/getDay() or a literal
 * `...Z` suffix.
 *
 * A schedule whose close <= open is an overnight window: it opens on the
 * listed day and ends the following calendar day (18:00–02:00).
 */

export const MARKET_TZ = 'Asia/Gaza';

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type DaySchedule = { open: string; close: string } | null;
export type WorkingHoursMap = Partial<Record<WeekdayKey, DaySchedule>>;

const DAY_MS = 24 * 60 * 60 * 1000;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (tz: string): Intl.DateTimeFormat => {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(tz, f);
  }
  return f;
};

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
  dateStr: string; // YYYY-MM-DD in tz
  hhmm: string; // HH:mm in tz
}

export const getZonedParts = (date: Date, tz: string = MARKET_TZ): ZonedParts => {
  const raw: Record<string, number> = {};
  for (const p of getFormatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') raw[p.type] = Number(p.value);
  }
  const { year, month, day, hour, minute } = raw;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    dateStr: `${year}-${pad(month)}-${pad(day)}`,
    hhmm: `${pad(hour)}:${pad(minute)}`,
  };
};

const offsetMs = (utcMs: number, tz: string): number => {
  const p = getZonedParts(new Date(utcMs), tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0) - Math.floor(utcMs / 60000) * 60000;
};

/** Convert a wall-clock date + HH:mm in `tz` to the matching UTC instant. */
export const zonedTimeToUtc = (dateStr: string, hhmm: string, tz: string = MARKET_TZ): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, h, mi, 0);
  // Two passes settle the offset correctly around DST transitions.
  let guess = wallAsUtc - offsetMs(wallAsUtc, tz);
  guess = wallAsUtc - offsetMs(guess, tz);
  return new Date(guess);
};

export const addDaysToDateStr = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
};

/** Weekday key for a calendar date string (tz-independent for a date label). */
export const weekdayKeyForDateStr = (dateStr: string): WeekdayKey => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

/** UTC window for `schedule` on market-local calendar day `dateStr`. */
export const workingWindowUtc = (
  dateStr: string,
  schedule: { open: string; close: string },
  tz: string = MARKET_TZ
): { start: Date; end: Date } => {
  const start = zonedTimeToUtc(dateStr, schedule.open, tz);
  const overnight = schedule.close <= schedule.open;
  const end = zonedTimeToUtc(overnight ? addDaysToDateStr(dateStr, 1) : dateStr, schedule.close, tz);
  return { start, end };
};

/**
 * Open/closed right now (or at `at`). null = hours never configured (render
 * nothing). Handles overnight windows, including the after-midnight tail that
 * belongs to the previous day's schedule.
 */
export const isOpenAt = (
  workingHours: unknown,
  at: Date = new Date(),
  tz: string = MARKET_TZ
): boolean | null => {
  if (!workingHours || typeof workingHours !== 'object') return null;
  const hours = workingHours as WorkingHoursMap;
  const now = getZonedParts(at, tz);

  const today = hours[WEEKDAY_KEYS[now.weekday]];
  if (today) {
    if (today.close > today.open) {
      if (now.hhmm >= today.open && now.hhmm < today.close) return true;
    } else if (now.hhmm >= today.open) {
      return true; // overnight: evening part of today's window
    }
  }

  const yesterday = hours[WEEKDAY_KEYS[(now.weekday + 6) % 7]];
  if (yesterday && yesterday.close <= yesterday.open && now.hhmm < yesterday.close) {
    return true; // overnight: after-midnight tail of yesterday's window
  }
  return false;
};

/**
 * Does [start, end] sit fully inside one of the provider's working windows?
 * Checks the start's local day and the previous day (overnight tail).
 */
export const fitsWorkingHours = (
  workingHours: unknown,
  start: Date,
  end: Date,
  tz: string = MARKET_TZ
): boolean => {
  if (!workingHours || typeof workingHours !== 'object') return false;
  const hours = workingHours as WorkingHoursMap;
  const startDate = getZonedParts(start, tz).dateStr;
  for (const dateStr of [addDaysToDateStr(startDate, -1), startDate]) {
    const schedule = hours[weekdayKeyForDateStr(dateStr)];
    if (!schedule) continue;
    const win = workingWindowUtc(dateStr, schedule, tz);
    if (start >= win.start && end <= win.end) return true;
  }
  return false;
};
