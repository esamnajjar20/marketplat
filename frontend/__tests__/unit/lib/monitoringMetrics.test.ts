import { describe, expect, it } from 'vitest';
import { percentile, summarizeDurations } from '@/lib/monitoringMetrics';

describe('monitoring metrics', () => {
  it('calculates nearest-rank percentiles from valid values', () => {
    expect(percentile([9, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5], 99)).toBe(5);
  });

  it('ignores negative and non-finite samples', () => {
    expect(percentile([-1, Number.NaN, Number.POSITIVE_INFINITY, 7, 3], 50)).toBe(3);
  });

  it('returns empty values when no valid sample exists', () => {
    expect(summarizeDurations([])).toEqual({ count: 0, average: null, p50: null, p95: null, p99: null });
    expect(summarizeDurations([-1, Number.NaN]).average).toBeNull();
  });

  it('returns average and percentiles from the same valid sample', () => {
    expect(summarizeDurations([10, 20, 30, 40, 50])).toEqual({ count: 5, average: 30, p50: 30, p95: 50, p99: 50 });
  });
});
