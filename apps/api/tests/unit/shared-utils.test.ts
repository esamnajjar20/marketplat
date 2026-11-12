import { safeTokenEquals } from '../../src/shared/utils/timingSafe';
import { sleep } from '../../src/shared/utils/sleep';
import { asPlainObject } from '../../src/shared/utils/asPlainObject';
import { ttlWithJitter } from '../../src/shared/cache/ttlJitter';
import {
  availabilityForStock,
  LOW_STOCK_THRESHOLD,
} from '../../src/shared/utils/stockAvailability';

describe('safeTokenEquals', () => {
  it('returns true only for identical strings', () => {
    expect(safeTokenEquals('abc123', 'abc123')).toBe(true);
    expect(safeTokenEquals('abc123', 'abc124')).toBe(false);
  });

  it('rejects different lengths without throwing', () => {
    expect(safeTokenEquals('abc', 'abcd')).toBe(false);
    expect(safeTokenEquals('', 'a')).toBe(false);
  });

  it('treats two empty strings as equal (callers must guard empty tokens)', () => {
    expect(safeTokenEquals('', '')).toBe(true);
  });
});

describe('availabilityForStock', () => {
  it.each([
    [-3, 'OUT_OF_STOCK'],
    [0, 'OUT_OF_STOCK'],
    [1, 'LIMITED'],
    [LOW_STOCK_THRESHOLD, 'LIMITED'],
    [LOW_STOCK_THRESHOLD + 1, 'IN_STOCK'],
    [500, 'IN_STOCK'],
  ])('quantity %p -> %s', (quantity, expected) => {
    expect(availabilityForStock(quantity)).toBe(expected);
  });
});

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    jest.useFakeTimers();
    const done = jest.fn();
    const pending = sleep(100).then(done);
    jest.advanceTimersByTime(99);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await pending;
    expect(done).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('asPlainObject', () => {
  it('returns plain objects as-is', () => {
    const value = { a: 1 };
    expect(asPlainObject(value)).toBe(value);
  });

  it.each([null, undefined, 0, '', 'x', 5, [], [1, 2]])('returns null for %p', value => {
    expect(asPlainObject(value)).toBeNull();
  });
});

describe('ttlWithJitter', () => {
  it('stays within [base, base + jitter)', () => {
    for (let i = 0; i < 500; i++) {
      const ttl = ttlWithJitter(45, 15);
      expect(ttl).toBeGreaterThanOrEqual(45);
      expect(ttl).toBeLessThan(60);
      expect(Number.isInteger(ttl)).toBe(true);
    }
  });
});
