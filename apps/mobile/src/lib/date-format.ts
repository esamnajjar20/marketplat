export type SafeDateStyle = 'date' | 'dateTime' | 'time';

/** Formats server-provided timestamps without allowing Invalid Date to crash a screen. */
export function formatSafeDate(value: string | number | Date | null | undefined, style: SafeDateStyle = 'date', fallback = 'التاريخ غير متاح'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  try {
    if (style === 'dateTime') return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    if (style === 'time') return new Intl.DateTimeFormat('ar', { timeStyle: 'short' }).format(date);
    return new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(date);
  } catch { return fallback; }
}
