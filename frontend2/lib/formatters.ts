/**
 * Display formatting utilities.
 *
 * FIX T-04: formatPrice() accepts string | null (Prisma Decimal → JSON string).
 *           Uses parseFloat() safely and returns '--' for null/NaN.
 */

// ── Price ─────────────────────────────────────────────────────────

/**
 * FIX T-04: price comes from backend as string (Prisma Decimal serialised to JSON).
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

/** Returns the raw numeric value from a price string, or null if invalid. */
export function parsePrice(price: string | null | undefined): number | null {
  if (!price) return null;
  const num = parseFloat(price);
  return Number.isNaN(num) ? null : num;
}

// ── Date / time ───────────────────────────────────────────────────

const RTF = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });

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
export function formatRelativeTime(dateStr: string): string {
  const date  = new Date(dateStr);
  const delta = (date.getTime() - Date.now()) / 1000; // seconds (negative = past)
  const abs   = Math.abs(delta);

  let prev = 1;
  for (const [threshold, unit] of THRESHOLDS) {
    if (abs < threshold) {
      return RTF.format(Math.round(delta / prev), unit);
    }
    prev = threshold;
  }
  return RTF.format(Math.round(delta / (365 * 86_400)), 'year');
}

/** Full localised date string in Arabic. */
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('ar-PS', {
    year:  'numeric',
    month: 'long',
    day:   'numeric',
  }).format(new Date(dateStr));
}

/**
 * Time-of-day only, e.g. for an appointment's scheduledStart/scheduledEnd
 * or an availability freeRanges entry.
 * @example formatTime("2026-08-05T09:30:00.000Z") → "9:30 ص"
 */
export function formatTime(dateStr: string): string {
  return new Intl.DateTimeFormat('ar-PS', {
    hour:   'numeric',
    minute: '2-digit',
    numberingSystem: 'latn',
  }).format(new Date(dateStr));
}

/** Combined date + time, e.g. for an appointment list row. */
export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)} — ${formatTime(dateStr)}`;
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
 * SEC-FIX-01: This export was missing, causing a build error in ImageUpload.tsx.
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
