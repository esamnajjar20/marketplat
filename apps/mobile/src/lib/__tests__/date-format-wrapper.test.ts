import { describe, expect, it } from 'vitest';
import { formatSafeDate } from '../date-format';

describe('formatSafeDate compatibility wrapper', () => {
  it('formats valid dates using the shared date formatter', () => {
    expect(formatSafeDate('2026-11-05T10:00:00.000Z', 'date')).not.toBe('التاريخ غير متاح');
  });

  it('uses the caller fallback for null, empty and invalid values', () => {
    expect(formatSafeDate(null)).toBe('التاريخ غير متاح');
    expect(formatSafeDate('')).toBe('التاريخ غير متاح');
    expect(formatSafeDate('not-a-date', 'date', '—')).toBe('—');
  });

  it('allows callers to override the fallback text', () => {
    expect(formatSafeDate(undefined, 'time', 'موعد غير معروف')).toBe('موعد غير معروف');
  });
});
