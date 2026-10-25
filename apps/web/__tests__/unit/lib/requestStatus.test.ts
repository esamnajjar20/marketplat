import { describe, expect, it } from 'vitest';
import { isRequestExpiringSoon } from '@/lib/requestStatus';

describe('isRequestExpiringSoon', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');

  it('uses the supplied clock instead of reading wall time when provided', () => {
    expect(isRequestExpiringSoon('2026-10-22T11:00:00.000Z', undefined, now)).toBe(true);
    expect(isRequestExpiringSoon('2026-10-22T13:00:00.000Z', undefined, now)).toBe(false);
  });

  it('does not show the badge for expired or invalid dates', () => {
    expect(isRequestExpiringSoon('2026-10-20T11:00:00.000Z', undefined, now)).toBe(false);
    expect(isRequestExpiringSoon('not-a-date', undefined, now)).toBe(false);
  });

  it('rejects an invalid supplied clock', () => {
    expect(isRequestExpiringSoon('2026-10-21T12:00:00.000Z', undefined, Number.NaN)).toBe(false);
  });
});
