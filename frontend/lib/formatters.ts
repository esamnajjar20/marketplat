/**
 * Display formatting utilities.
 *
 * formatPrice() accepts string | null (Prisma Decimal → JSON string).
 *           Uses parseFloat() safely and returns '--' for null/NaN.
 */

import type { ServicePricingType } from '@/types/service.types';
import { calendarDayDifference, formatCurrencyValue, formatDateValue, formatListingPriceValue, formatNumberValue, formatShortDateValue, toValidSharedDate } from '@marketplat/contracts';

// ── Number ────────────────────────────────────────────────────────

/**
 * Locale-aware integer/count formatter (e.g. stats, analytics counts).
 * Centralised so a future locale change (e.g. 'ar' → 'ar-EG' digits)
 * is a one-line edit instead of a multi-file find/replace.
 *
 * @example formatNumber(12000) → "12,000"
 */
export function formatNumber(value: number | null | undefined): string {
  return formatNumberValue(value, 2, '--');
}

/** Ratio (0..1) as a percentage with up to 1 decimal. @example formatPercent(0.256) → "25.6%" */
export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '--';
  return `${new Intl.NumberFormat('ar-PS', { numberingSystem: 'latn', maximumFractionDigits: 1 }).format(rate * 100)}%`;
}

// ── Price ─────────────────────────────────────────────────────────

/**
 * price comes from backend as string (Prisma Decimal serialised to JSON).
 * Never assume it's a number — always parse first.
 *
 * @example formatPrice("45000.00") → "45,000 ₪"
 * @example formatPrice(null)       → "السعر غير محدد"
 */
export function formatPrice(
  price: string | number | null | undefined,
  currency = '₪',
): string {
  return formatListingPriceValue(price, currency, 'السعر غير محدد');
}

/**
 * Money with fixed 2 decimals + currency (sales/receipts/debts, where
 * piastres matter). Single source for every "X.XX ₪" string — do not
 * hand-roll `.toFixed(2) + ' ₪'`. Use formatPrice() for listing prices
 * (0 decimals, "السعر غير محدد" fallback).
 *
 * @example formatMoney("12345.5") → "12,345.50 ₪"
 * @example formatMoney(null)      → "غير متاح"
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency = '₪',
): string {
  return formatCurrencyValue(value, currency, 'غير متاح');
}

/**
 * Service listing price label: "حسب الاتفاق" for NEGOTIABLE / missing price,
 * "يبدأ من X" for STARTING_FROM, otherwise the plain formatted price.
 */
export function formatServicePrice(
  pricingType: ServicePricingType,
  price: string | null,
): string {
  if (pricingType === 'NEGOTIABLE' || !price) return 'حسب الاتفاق';
  const formatted = formatPrice(price);
  return pricingType === 'STARTING_FROM' ? `يبدأ من ${formatted}` : formatted;
}

/** Returns the raw numeric value from a price string, or null if invalid. */
export function parsePrice(price: string | null | undefined): number | null {
  if (!price) return null;
  const num = parseFloat(price);
  return Number.isNaN(num) ? null : num;
}

// ── Date / time ───────────────────────────────────────────────────

const RTF = new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'auto', });
const GAZA_DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit',
});
function gazaCalendarParts(date: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(GAZA_DATE_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

const THRESHOLDS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60,           'second'],
  [3_600,        'minute'],
  [86_400,       'hour'],
  [7 * 86_400,   'day'],
  [30 * 86_400,  'week'],
  [365 * 86_400, 'month'],
  [Infinity,     'year'],
];

/**
 * Human-readable relative time in Arabic.
 * @example formatRelativeTime("2024-01-01T00:00:00Z") → "منذ سنتين"
 */
export function formatRelativeTime(dateStr: string, now = Date.now()): string {
  // SW-FMT-INVALID-DATE-01: a null/empty/unparseable date from the
  // backend produced "منذ NaN سنة" or, worse, an Intl RangeError.
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '—';
  const delta = (date.getTime() - now) / 1000;
  const abs = Math.abs(delta);

  let prev = 1;
  for (const [threshold, unit] of THRESHOLDS) {
    if (abs < threshold) {
      return RTF.format(Math.round(delta / prev), unit);
    }
    prev = threshold;
  }
  return RTF.format(Math.round(delta / (365 * 86_400)), 'year');
}


/**
 * Compact relative time for dense lists (conversation inbox).
 * Unlike formatRelativeTime — which always speaks in "منذ X" units —
 * this switches to a concrete representation as the date gets older
 * (Slack/WhatsApp style): "5د" for minutes, the wall clock for today,
 * "أمس" for yesterday, the weekday for the last week, the calendar day
 * for the current year, and dd/mm/yy beyond. The idea: the older the
 * date, the more exact the answer needs to be.
 */
export function formatRelativeTimeShort(dateStr: string, now = Date.now()): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '—';

  const diffSec = (now - date.getTime()) / 1000;
  if (diffSec < 0) return formatRelativeTime(dateStr, now);
  if (diffSec < 60) return 'الآن';
  if (diffSec < 3_600) return `${Math.floor(diffSec / 60)}د`;

  const nowDate = new Date(now);
  const nowCalendar = gazaCalendarParts(nowDate);
  const dateCalendar = gazaCalendarParts(date);
  const daysAgo = calendarDayDifference(nowDate, date) ?? -1;

  if (daysAgo === 0) {
    return new Intl.DateTimeFormat('ar-PS', {
      hour: 'numeric', minute: '2-digit', numberingSystem: 'latn', timeZone: 'Asia/Gaza',
    }).format(date);
  }
  if (daysAgo === 1) return 'أمس';
  if (daysAgo > 1 && daysAgo < 7) {
    return new Intl.DateTimeFormat('ar-PS', { weekday: 'long', timeZone: 'Asia/Gaza' }).format(date);
  }
  if (dateCalendar.year === nowCalendar.year) {
    return new Intl.DateTimeFormat('ar-PS', { day: 'numeric', month: 'long', numberingSystem: 'latn', timeZone: 'Asia/Gaza' }).format(date);
  }
  const dd = String(dateCalendar.day).padStart(2, '0');
  const mm = String(dateCalendar.month).padStart(2, '0');
  const yy = String(dateCalendar.year).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

/** Full localised date string in Arabic. */
export function formatDate(dateStr: string): string {
  return formatDateValue(dateStr, 'date', '—');
}

/** Time-of-day only in the product timezone. */
export function formatTime(dateStr: string): string {
  return formatDateValue(dateStr, 'time', '—');
}

/** Combined date + time in the product timezone. */
export function formatDateTime(dateStr: string): string {
  return formatDateValue(dateStr, 'dateTime', '—');
}

/**
 * Accepts the shapes call sites actually hold (ISO string, epoch ms, Date)
 * and returns null for anything unparseable so no formatter can throw.
 */
type DateInput = string | number | Date | null | undefined;

/** Date + time in Asia/Gaza. */
export function formatTimestamp(value: DateInput): string {
  return formatDateValue(value, 'dateTime', '—');
}

/** Date only (numeric) in Asia/Gaza. */
export function formatShortDate(value: DateInput): string {
  return formatShortDateValue(value, '—');
}

/** Medium-style date + time in the same product timezone. */
export function formatDateTimeMedium(value: DateInput): string {
  return formatDateValue(value, 'dateTime', '—');
}

/** Clock time only in the Gaza timezone, e.g. log rows. */
export function formatClockTime(value: DateInput): string {
  const d = toValidSharedDate(value);
  return d ? d.toLocaleTimeString('ar-PS', { numberingSystem: 'latn', timeZone: 'Asia/Gaza' }) : '—';
}

/** Clock time with milliseconds in the Gaza timezone (Latin digits), e.g. network/diagnostic logs. */
export function formatClockTimeMs(value: DateInput): string {
  const d = toValidSharedDate(value);
  return d
    ? new Intl.DateTimeFormat('ar-PS', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, numberingSystem: 'latn', timeZone: 'Asia/Gaza' }).format(d)
    : '';
}

/** Hour:minute only in the Gaza timezone with Latin digits, e.g. draft-saved / story timestamps. */
export function formatHourMinute(value: DateInput): string {
  const d = toValidSharedDate(value);
  return d
    ? new Intl.DateTimeFormat('ar-PS', { hour: 'numeric', minute: '2-digit', numberingSystem: 'latn', timeZone: 'Asia/Gaza' }).format(d)
    : '';
}

/** Short "day month, hh:mm" in the Gaza timezone with Latin digits, e.g. activity-log rows. */
export function formatDayMonthTime(value: DateInput): string {
  const d = toValidSharedDate(value);
  return d
    ? new Intl.DateTimeFormat('ar-PS', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', numberingSystem: 'latn', timeZone: 'Asia/Gaza' }).format(d)
    : '';
}

// ── Strings ───────────────────────────────────────────────────────

/** Truncate text to maxLength with ellipsis. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '…';
}

/** Format a phone number for display (basic). */
export function formatPhone(phone: string): string {
  // Example: +970591234567 → +970 59-123-4567
  return phone.replace(/(\+\d{3})(\d{2})(\d{3})(\d{4})/, '$1 $2-$3-$4');
}

// ── File size ─────────────────────────────────────────────────────

/**
 * SEC-This export was missing, causing a build error in ImageUpload.tsx.
 *
 * Format a byte count as a human-readable string.
 * @example formatFileSize(1_234_567) → "1.2 MB"
 * @example formatFileSize(800)       → "800 B"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1_024)                 return `${bytes} B`;
  if (bytes < 1_024 * 1_024)        return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_024 * 1_024 * 1_024) return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
  return `${(bytes / (1_024 * 1_024 * 1_024)).toFixed(1)} GB`;
}
