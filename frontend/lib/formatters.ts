/**
 * Display formatting utilities.
 *
 * formatPrice() accepts string | null (Prisma Decimal → JSON string).
 *           Uses parseFloat() safely and returns '--' for null/NaN.
 */

import type { ServicePricingType } from '@/types/service.types';

// ── Number ────────────────────────────────────────────────────────

/**
 * Locale-aware integer/count formatter (e.g. stats, analytics counts).
 * Centralised so a future locale change (e.g. 'ar' → 'ar-EG' digits)
 * is a one-line edit instead of a multi-file find/replace.
 *
 * @example formatNumber(12000) → "12,000"
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  // Latin digits everywhere (same as formatPrice/formatMoney/formatTime) so a
  // single screen never mixes ١٢٣ and 123.
  return new Intl.NumberFormat('ar-PS', { numberingSystem: 'latn', maximumFractionDigits: 2 }).format(value);
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
  if (price === null || price === undefined || price === '') {
    return 'السعر غير محدد';
  }
  const num = typeof price === 'number' ? price : parseFloat(price);
  if (Number.isNaN(num)) return 'السعر غير محدد';

  return (
    new Intl.NumberFormat('ar-PS', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      numberingSystem: 'latn',
    }).format(num) +
    ' ' +
    currency
  );
}

/**
 * Money with fixed 2 decimals + currency (sales/receipts/debts, where
 * piastres matter). Single source for every "X.XX ₪" string — do not
 * hand-roll `.toFixed(2) + ' ₪'`. Use formatPrice() for listing prices
 * (0 decimals, "السعر غير محدد" fallback).
 *
 * @example formatMoney("12345.5") → "12,345.50 ₪"
 * @example formatMoney(null)      → "0.00 ₪"
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency = '₪',
): string {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  return (
    new Intl.NumberFormat('ar-PS', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      numberingSystem: 'latn',
    }).format(safe) +
    ' ' +
    currency
  );
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

const RTF = new Intl.RelativeTimeFormat('ar', { numeric: 'auto', numberingSystem: 'latn' });
const GAZA_DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit',
});
function gazaDayNumber(date: Date): number {
  const parts = Object.fromEntries(GAZA_DATE_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000);
}
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
  if (diffSec < 60) return 'الآن';
  if (diffSec < 3_600) return `${Math.floor(diffSec / 60)}د`;

  const nowDate = new Date(now);
  const nowCalendar = gazaCalendarParts(nowDate);
  const dateCalendar = gazaCalendarParts(date);
  const daysAgo = gazaDayNumber(nowDate) - gazaDayNumber(date);

  if (daysAgo === 0) {
    return new Intl.DateTimeFormat('ar-PS', {
      hour: 'numeric', minute: '2-digit', numberingSystem: 'latn', timeZone: 'Asia/Gaza',
    }).format(date);
  }
  if (daysAgo === 1) return 'أمس';
  if (daysAgo < 7) {
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
  // SW-FMT-INVALID-DATE-01: Intl.DateTimeFormat.format() throws
  // RangeError on an Invalid Date.
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-PS', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    numberingSystem: 'latn',
    timeZone: 'Asia/Gaza',
  }).format(d);
}

/**
 * Time-of-day only, e.g. for an appointment's scheduledStart/scheduledEnd
 * or an availability freeRanges entry.
 * @example formatTime("2026-08-05T09:30:00.000Z") → "9:30 ص"
 */
export function formatTime(dateStr: string): string {
  // SW-FMT-INVALID-DATE-01
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-PS', {
    hour: 'numeric',
    minute: '2-digit',
    numberingSystem: 'latn',
    timeZone: 'Asia/Gaza',
  }).format(d);
}

/** Combined date + time, e.g. for an appointment list row. */
export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)} — ${formatTime(dateStr)}`;
}

/**
 * Accepts the shapes call sites actually hold (ISO string, epoch ms, Date)
 * and returns null for anything unparseable so no formatter can throw.
 */
type DateInput = string | number | Date | null | undefined;
function toValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date + time in the Gaza timezone, e.g. admin panels, sync/draft logs. */
export function formatTimestamp(value: DateInput): string {
  const d = toValidDate(value);
  return d ? d.toLocaleString('ar-PS', { numberingSystem: 'latn', timeZone: 'Asia/Gaza' }) : '—';
}

/** Date only (numeric) in the Gaza timezone, e.g. table cells. */
export function formatShortDate(value: DateInput): string {
  const d = toValidDate(value);
  return d ? d.toLocaleDateString('ar-PS', { numberingSystem: 'latn', timeZone: 'Asia/Gaza' }) : '—';
}

/** "5 Aug 2026, 9:30 AM"-style medium date + short time in Gaza TZ (lists, banners). */
export function formatDateTimeMedium(value: DateInput): string {
  const d = toValidDate(value);
  return d
    ? new Intl.DateTimeFormat('ar-PS', { dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn', timeZone: 'Asia/Gaza' }).format(d)
    : '—';
}

/** Clock time only in the Gaza timezone, e.g. log rows. */
export function formatClockTime(value: DateInput): string {
  const d = toValidDate(value);
  return d ? d.toLocaleTimeString('ar-PS', { numberingSystem: 'latn', timeZone: 'Asia/Gaza' }) : '—';
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
