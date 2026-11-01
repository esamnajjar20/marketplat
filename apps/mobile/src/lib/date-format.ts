import { formatDate, type DateFormatKind } from '@/lib/formatters';

export type SafeDateStyle = DateFormatKind;

/** Compatibility wrapper; all date rendering now uses the shared locale policy. */
export function formatSafeDate(value: string | number | Date | null | undefined, style: SafeDateStyle = 'date', fallback = 'التاريخ غير متاح'): string {
  const formatted = formatDate(value, style);
  return formatted === 'غير متاح' ? fallback : formatted;
}
