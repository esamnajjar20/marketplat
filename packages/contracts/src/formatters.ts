/**
 * Platform-neutral display formatters shared by Web and Mobile.
 * Values are presentation-only; financial calculations must use Decimal-safe
 * backend/domain arithmetic before passing a result here.
 */
export const MARKET_LOCALE = 'ar-PS-u-nu-latn';
export const MARKET_TIME_ZONE = 'Asia/Gaza';

export type SharedDateFormatKind = 'date' | 'time' | 'dateTime';

const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: '₪', '₪': '₪', NIS: '₪',
  USD: '$', '$': '$',
  EUR: '€', '€': '€',
  JOD: 'د.أ', SAR: 'ر.س', EGP: 'ج.م', GBP: '£',
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumberValue(
  value: unknown,
  maximumFractionDigits = 2,
  fallback = '--',
): string {
  const amount = finiteNumber(value);
  if (amount === null) return fallback;
  const digits = Math.max(0, Math.min(20, Math.trunc(maximumFractionDigits)));
  return new Intl.NumberFormat(MARKET_LOCALE, { maximumFractionDigits: digits }).format(amount);
}

/** Currency/accounting amount: missing values remain missing, never silently become zero. */
export function formatCurrencyValue(
  value: unknown,
  currency = 'ILS',
  fallback = 'غير متاح',
): string {
  const amount = finiteNumber(value);
  if (amount === null) return fallback;
  const normalized = currency.trim().toUpperCase();
  const symbol = CURRENCY_SYMBOLS[currency] ?? CURRENCY_SYMBOLS[normalized] ?? (normalized || '₪');
  return `${new Intl.NumberFormat(MARKET_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${symbol}`;
}

/** Listing prices intentionally use whole units, distinct from accounting amounts. */
export function formatListingPriceValue(
  value: unknown,
  currency = 'ILS',
  fallback = 'السعر غير محدد',
): string {
  const amount = finiteNumber(value);
  if (amount === null) return fallback;
  const normalized = currency.trim().toUpperCase();
  const symbol = CURRENCY_SYMBOLS[currency] ?? CURRENCY_SYMBOLS[normalized] ?? (normalized || '₪');
  return `${new Intl.NumberFormat(MARKET_LOCALE, { maximumFractionDigits: 0 }).format(amount)} ${symbol}`;
}

export function toValidSharedDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateValue(
  value: unknown,
  kind: SharedDateFormatKind = 'date',
  fallback = '—',
): string {
  const date = toValidSharedDate(value);
  if (!date) return fallback;
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: 'long', day: 'numeric',
    numberingSystem: 'latn', timeZone: MARKET_TIME_ZONE,
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric', minute: '2-digit',
    numberingSystem: 'latn', timeZone: MARKET_TIME_ZONE,
  };
  if (kind === 'date') return new Intl.DateTimeFormat(MARKET_LOCALE, dateOptions).format(date);
  if (kind === 'time') return new Intl.DateTimeFormat(MARKET_LOCALE, timeOptions).format(date);
  return `${new Intl.DateTimeFormat(MARKET_LOCALE, dateOptions).format(date)} — ${new Intl.DateTimeFormat(MARKET_LOCALE, timeOptions).format(date)}`;
}

export function formatShortDateValue(value: unknown, fallback = '—'): string {
  const date = toValidSharedDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(MARKET_LOCALE, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    numberingSystem: 'latn', timeZone: MARKET_TIME_ZONE,
  }).format(date);
}

/** Numeric day index in the product timezone; safe across DST boundaries. */
export function getCalendarDayNumber(value: Date | string | number): number | null {
  const date = toValidSharedDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MARKET_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Returns the calendar-day distance `from - to` in Asia/Gaza. */
export function calendarDayDifference(from: Date | string | number, to: Date | string | number): number | null {
  const fromDay = getCalendarDayNumber(from);
  const toDay = getCalendarDayNumber(to);
  return fromDay === null || toDay === null ? null : fromDay - toDay;
}
