const NUMBER_LOCALE = 'ar-u-nu-latn';

export type DateFormatKind = 'date' | 'time' | 'dateTime';

/** Format non-currency quantities with the same explicit Latin-digit policy. */
export function formatNumber(value: unknown, maximumFractionDigits = 0): string {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: Math.max(0, Math.min(20, maximumFractionDigits)) }).format(amount);
}

/** Format prices consistently across the mobile app using Latin digits. */
export function formatMoney(value: unknown, currency = 'ILS'): string {
  if (value === null || value === undefined || value === '') return 'غير متاح';
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return 'غير متاح';
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'ILS';
  try {
    return new Intl.NumberFormat(NUMBER_LOCALE, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'symbol',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 2 }).format(amount)} ${code}`;
  }
}

/** Parse dates defensively and keep Latin digits stable in Arabic UI. */
export function formatDate(value: Date | string | number | null | undefined, kind: DateFormatKind = 'dateTime'): string {
  if (value === null || value === undefined || value === '') return 'غير متاح';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متاح';
  const options: Intl.DateTimeFormatOptions = kind === 'date'
    ? { dateStyle: 'medium', timeZone: 'Asia/Gaza' }
    : kind === 'time'
      ? { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Gaza' }
      : { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Gaza' };
  return new Intl.DateTimeFormat(NUMBER_LOCALE, options).format(date);
}
