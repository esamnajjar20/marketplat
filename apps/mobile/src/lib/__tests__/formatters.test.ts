import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatNumber } from '../formatters';

describe('formatDate market timezone', () => {
  it('formats appointment instants in Asia/Gaza, regardless of device timezone', () => {
    const instant = '2026-11-03T22:00:00.000Z';
    expect(formatDate(instant, 'date')).toContain('04');
    expect(formatDate(instant, 'time')).toContain('12:00');
    expect(formatDate(instant, 'dateTime')).toContain('12:00');
    // Platform default is date-only; callers needing time must request it.
    expect(formatDate(instant)).toBe(formatDate(instant, 'date'));
  });
});


describe('shared number and currency formatting', () => {
  it('uses the same two-decimal number precision as web by default', () => {
    expect(formatNumber(1.2)).toBe('1.2');
    expect(formatNumber(12345)).toBe('12,345');
  });

  it('keeps missing monetary values unavailable and accepts currency codes', () => {
    expect(formatMoney(null)).toBe('غير متاح');
    expect(formatMoney(12345.5, 'ILS')).toBe('12,345.50 ₪');
    expect(formatMoney(5, 'USD')).toBe('5.00 $');
  });
});
