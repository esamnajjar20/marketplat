import {
  formatCurrencyValue,
  formatDateValue,
  formatNumberValue,
  type SharedDateFormatKind,
} from '@marketplat/contracts';

export type DateFormatKind = SharedDateFormatKind;

/** Same locale, precision and missing-value behavior as the web client. */
export function formatNumber(value: unknown, maximumFractionDigits = 2): string {
  return formatNumberValue(value, maximumFractionDigits, '--');
}

/** Accounting amounts use two fractional digits; null is not interpreted as zero. */
export function formatMoney(value: unknown, currency = 'ILS'): string {
  return formatCurrencyValue(value, currency, 'غير متاح');
}

/** Date-only, time-only and date-time modes are explicit and share Asia/Gaza. */
export function formatDate(
  value: Date | string | number | null | undefined,
  kind: DateFormatKind = 'date',
): string {
  return formatDateValue(value, kind, '—');
}
