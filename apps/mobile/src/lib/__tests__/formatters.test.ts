import { describe, expect, it } from 'vitest';
import { formatDate } from '../formatters';

describe('formatDate market timezone', () => {
  it('formats appointment instants in Asia/Gaza, regardless of device timezone', () => {
    const instant = '2026-11-03T22:00:00.000Z';
    expect(formatDate(instant, 'date')).toContain('04');
    expect(formatDate(instant, 'time')).toContain('12:00');
    expect(formatDate(instant, 'dateTime')).toContain('12:00');
  });
});
