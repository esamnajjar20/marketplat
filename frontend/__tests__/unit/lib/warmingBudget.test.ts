import { describe, expect, it } from 'vitest';
import { getWarmingBudget } from '../../../lib/warmingBudget';
import type { NetworkPolicy } from '../../../lib/networkPolicy';

const policy = (tier: NetworkPolicy['tier'], overrides: Partial<NetworkPolicy> = {}): NetworkPolicy => ({
  tier,
  quality: 'unknown',
  saveData: false,
  effectiveType: null,
  downlinkMbps: null,
  rttMs: null,
  consecutiveFailures: 0,
  allowPrefetch: true,
  allowBackgroundWarming: true,
  allowBackgroundSync: true,
  allowOriginalImages: true,
  pageSizeMultiplier: 1,
  maxPrefetchDistancePx: 500,
  maxPrefetchConcurrency: 2,
  queueConcurrency: 2,
  uploadConcurrency: 1,
  uploadTimeoutMs: 30_000,
  uploadRetryDelaysMs: [1000],
  requestTimeoutMs: 15_000,
  ...overrides,
});

describe('warming budget', () => {
  it('keeps unknown connections conservative even in full mode', () => {
    const budget = getWarmingBudget(policy('unknown'), 'full');
    expect(budget.maxConcurrency).toBe(1);
    expect(budget.maxRouteCount).toBe(8);
    expect(budget.allowImages).toBe(false);
  });

  it('allows full mode to expand only on normal/fast links', () => {
    const normal = getWarmingBudget(policy('normal'), 'full');
    const slow = getWarmingBudget(policy('slow'), 'full');
    expect(normal.maxRouteCount).toBeGreaterThan(20);
    expect(slow.maxRouteCount).toBe(12);
  });

  it('cuts the budget after repeated failures', () => {
    const budget = getWarmingBudget(policy('fast', { consecutiveFailures: 2 }), 'fast');
    expect(budget.maxConcurrency).toBe(1);
    expect(budget.allowImages).toBe(false);
    expect(budget.maxRequests).toBe(30);
  });
});
