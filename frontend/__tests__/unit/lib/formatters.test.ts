/**
 * __tests__/unit/lib/formatters.test.ts
 *
 * Coverage targets:
 *  - formatPrice: string/number/null/undefined/NaN/negative/zero/large
 *  - parsePrice: valid/null/empty/NaN
 *  - formatRelativeTime: past/future/seconds/minutes/hours/days/weeks/months/years
 *  - formatDate: produces Arabic locale date
 *  - truncate: exact limit / under / over / empty
 *  - formatPhone: Palestinian format
 *  - formatFileSize: B / KB / MB / GB boundaries
 */
import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  parsePrice,
  formatRelativeTime,
  formatDate,
  truncate,
  formatPhone,
  formatFileSize,
} from '@/lib/formatters';

// ── formatPrice ───────────────────────────────────────────────────

describe('formatPrice', () => {
  it('formats a numeric string with Arabic-PS locale and shekel symbol', () => {
    const result = formatPrice('45000');
    expect(result).toContain('₪');
    expect(result).toContain('45');
  });

  it('formats a number directly', () => {
    const result = formatPrice(1000);
    expect(result).toContain('₪');
  });

  it('formats a Prisma Decimal string (e.g. "45000.00")', () => {
    const result = formatPrice('45000.00');
    expect(result).toContain('₪');
    expect(result).not.toContain('.00'); // maximumFractionDigits=0
  });

  it('returns "السعر غير محدد" for null', () => {
    expect(formatPrice(null)).toBe('السعر غير محدد');
  });

  it('returns "السعر غير محدد" for undefined', () => {
    expect(formatPrice(undefined)).toBe('السعر غير محدد');
  });

  it('returns "السعر غير محدد" for empty string', () => {
    expect(formatPrice('')).toBe('السعر غير محدد');
  });

  it('returns "السعر غير محدد" for non-numeric string', () => {
    expect(formatPrice('abc')).toBe('السعر غير محدد');
  });

  it('formats zero correctly', () => {
    const result = formatPrice(0);
    expect(result).toContain('₪');
    expect(result).not.toBe('السعر غير محدد');
  });

  it('formats negative numbers (edge case)', () => {
    const result = formatPrice(-100);
    expect(result).toContain('₪');
  });

  it('supports custom currency symbol', () => {
    const result = formatPrice('1000', '$');
    expect(result).toContain('$');
    expect(result).not.toContain('₪');
  });

  it('handles very large numbers', () => {
    const result = formatPrice('1000000000');
    expect(result).toContain('₪');
    expect(result).not.toBe('السعر غير محدد');
  });

  it('handles "0.00" (Prisma zero price)', () => {
    const result = formatPrice('0.00');
    expect(result).toContain('₪');
    expect(result).not.toBe('السعر غير محدد');
  });
});

// ── parsePrice ────────────────────────────────────────────────────

describe('parsePrice', () => {
  it('parses a valid price string to number', () => {
    expect(parsePrice('45000.50')).toBe(45000.50);
  });

  it('returns null for null', () => {
    expect(parsePrice(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parsePrice(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePrice('')).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(parsePrice('abc')).toBeNull();
  });

  it('parses "0" to 0', () => {
    expect(parsePrice('0')).toBe(0);
  });

  it('parses integer string', () => {
    expect(parsePrice('1000')).toBe(1000);
  });
});

// ── formatRelativeTime ────────────────────────────────────────────

describe('formatRelativeTime', () => {
  const now = Date.now();

  function past(seconds: number): string {
    return new Date(now - seconds * 1000).toISOString();
  }
  function future(seconds: number): string {
    return new Date(now + seconds * 1000).toISOString();
  }

  it('returns a non-empty Arabic string', () => {
    const result = formatRelativeTime(past(3600));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles "seconds ago" range (< 60s)', () => {
    const result = formatRelativeTime(past(30));
    // Arabic relative format — just assert it's a string and not crashing
    expect(typeof result).toBe('string');
  });

  it('handles "minutes ago" range (1-59 min)', () => {
    const result = formatRelativeTime(past(120));
    expect(typeof result).toBe('string');
  });

  it('handles "hours ago" range', () => {
    const result = formatRelativeTime(past(7200));
    expect(typeof result).toBe('string');
  });

  it('handles "days ago" range', () => {
    const result = formatRelativeTime(past(86400 * 3));
    expect(typeof result).toBe('string');
  });

  it('handles "weeks ago" range', () => {
    const result = formatRelativeTime(past(86400 * 14));
    expect(typeof result).toBe('string');
  });

  it('handles "months ago" range', () => {
    const result = formatRelativeTime(past(86400 * 60));
    expect(typeof result).toBe('string');
  });

  it('handles "years ago" range', () => {
    const result = formatRelativeTime(past(86400 * 400));
    expect(typeof result).toBe('string');
  });

  it('handles future dates (positive delta)', () => {
    const result = formatRelativeTime(future(3600));
    expect(typeof result).toBe('string');
  });

  it('does not throw for edge date (epoch)', () => {
    expect(() => formatRelativeTime(new Date(0).toISOString())).not.toThrow();
  });
});

// ── formatDate ────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns an Arabic locale date string', () => {
    const result = formatDate('2024-06-01T00:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not throw for various ISO strings', () => {
    const dates = [
      '2020-01-01T00:00:00.000Z',
      '2000-12-31T23:59:59Z',
      '1970-01-01T00:00:00Z',
    ];
    for (const d of dates) {
      expect(() => formatDate(d)).not.toThrow();
    }
  });
});

// ── truncate ─────────────────────────────────────────────────────

describe('truncate', () => {
  it('returns the original string when <= maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns the string unchanged when exactly maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when > maxLength', () => {
    const result = truncate('hello world', 5);
    expect(result).toMatch(/…$/);
    expect(result.length).toBeLessThanOrEqual(6); // 5 chars + ellipsis
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('handles maxLength of 0', () => {
    const result = truncate('hello', 0);
    expect(result).toContain('…');
  });

  it('trims trailing whitespace before adding ellipsis', () => {
    const result = truncate('hello   world', 8);
    expect(result).not.toMatch(/ …$/);
    expect(result).toMatch(/\w…$/);
  });

  it('handles Arabic text correctly', () => {
    const result = truncate('مرحبا بكم في سوق غزة', 5);
    expect(result).toContain('…');
  });
});

// ── formatPhone ───────────────────────────────────────────────────

describe('formatPhone', () => {
  it('formats a Palestinian mobile number', () => {
    const result = formatPhone('+970591234567');
    expect(result).toContain('+970');
    expect(result).toContain('59');
  });

  it('returns a string for any input (no throw)', () => {
    expect(() => formatPhone('+972501234567')).not.toThrow();
    expect(() => formatPhone('')).not.toThrow();
  });
});

// ── formatFileSize ────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes (< 1 KB)', () => {
    expect(formatFileSize(800)).toBe('800 B');
  });

  it('formats exactly 1023 bytes as B', () => {
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats 1 KB (1024 bytes)', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats KB range', () => {
    expect(formatFileSize(1_500)).toBe('1.5 KB');
  });

  it('formats 1 MB (1024 * 1024 bytes)', () => {
    expect(formatFileSize(1_048_576)).toBe('1.0 MB');
  });

  it('formats MB range', () => {
    expect(formatFileSize(1_234_567)).toBe('1.2 MB');
  });

  it('formats 1 GB', () => {
    expect(formatFileSize(1_073_741_824)).toBe('1.0 GB');
  });

  it('formats large GB value', () => {
    const result = formatFileSize(5_368_709_120); // 5 GB
    expect(result).toBe('5.0 GB');
  });

  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('never returns empty string', () => {
    for (const n of [0, 1, 1023, 1024, 1048576, 1073741824]) {
      expect(formatFileSize(n).length).toBeGreaterThan(0);
    }
  });
});
