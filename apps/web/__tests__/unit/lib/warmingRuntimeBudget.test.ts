import { describe, expect, it } from 'vitest';
import { beginWarmingRuntimeBudget, getWarmingRuntimeBudgetState, reserveWarmingRequest, recordWarmingRuntimeBytes } from '../../../lib/warmingRuntimeBudget';

describe('warming runtime budget', () => {
  it('hard-stops requests and bytes inside one pass', () => {
    const end = beginWarmingRuntimeBudget({
      maxRequests: 2, maxBytes: 100, maxDurationMs: 1000, maxConcurrency: 1,
      maxRouteCount: 1, maxPersonalRouteCount: 1, allowImages: false,
    });
    try {
      expect(reserveWarmingRequest()).toBe(true);
      expect(recordWarmingRuntimeBytes(60)).toBe(true);
      expect(reserveWarmingRequest(50)).toBe(false);
      expect(reserveWarmingRequest()).toBe(true);
      expect(recordWarmingRuntimeBytes(40)).toBe(true);
      expect(reserveWarmingRequest()).toBe(false);
      expect(getWarmingRuntimeBudgetState()).toEqual({ requests: 2, bytes: 100 });
    } finally {
      end();
    }
  });
});
