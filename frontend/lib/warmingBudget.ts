/** Adaptive global budget for one client warming pass. */
'use client';

import type { NetworkPolicy, NetworkTier } from './networkPolicy';

export interface WarmingBudget {
  maxRequests: number;
  maxBytes: number;
  maxDurationMs: number;
  maxConcurrency: number;
  maxRouteCount: number;
  maxPersonalRouteCount: number;
  allowImages: boolean;
}

const BASE_BUDGETS: Record<NetworkTier, WarmingBudget> = {
  offline: { maxRequests: 0, maxBytes: 0, maxDurationMs: 0, maxConcurrency: 0, maxRouteCount: 0, maxPersonalRouteCount: 0, allowImages: false },
  'very-slow': { maxRequests: 16, maxBytes: 512_000, maxDurationMs: 20_000, maxConcurrency: 1, maxRouteCount: 8, maxPersonalRouteCount: 2, allowImages: false },
  slow: { maxRequests: 24, maxBytes: 1_500_000, maxDurationMs: 35_000, maxConcurrency: 1, maxRouteCount: 12, maxPersonalRouteCount: 4, allowImages: false },
  normal: { maxRequests: 40, maxBytes: 4_000_000, maxDurationMs: 60_000, maxConcurrency: 2, maxRouteCount: 20, maxPersonalRouteCount: 6, allowImages: false },
  fast: { maxRequests: 60, maxBytes: 10_000_000, maxDurationMs: 90_000, maxConcurrency: 3, maxRouteCount: 40, maxPersonalRouteCount: 12, allowImages: true },
  unknown: { maxRequests: 12, maxBytes: 1_000_000, maxDurationMs: 30_000, maxConcurrency: 1, maxRouteCount: 8, maxPersonalRouteCount: 3, allowImages: false },
};

export function getWarmingBudget(policy: NetworkPolicy, mode: 'fast' | 'full'): WarmingBudget {
  const base = { ...BASE_BUDGETS[policy.tier] };
  if (policy.saveData || policy.tier === 'offline') {
    return { ...base, maxRequests: 0, maxBytes: 0, maxDurationMs: 0, maxConcurrency: 0, maxRouteCount: 0, maxPersonalRouteCount: 0, allowImages: false };
  }

  // Explicit "full" is allowed to warm more, but it never overrides a weak
  // network/device policy. This prevents a user preference from turning a
  // 2G link into an unbounded background downloader.
  if (mode === 'full' && (policy.tier === 'normal' || policy.tier === 'fast')) {
    base.maxRequests = Math.min(100, Math.round(base.maxRequests * 1.5));
    base.maxBytes = Math.min(20_000_000, Math.round(base.maxBytes * 1.5));
    base.maxDurationMs = Math.min(120_000, Math.round(base.maxDurationMs * 1.25));
    base.maxRouteCount = 60;
    base.maxPersonalRouteCount = 20;
  }

  if (policy.consecutiveFailures >= 2) {
    base.maxRequests = Math.max(1, Math.floor(base.maxRequests * 0.5));
    base.maxBytes = Math.max(128_000, Math.floor(base.maxBytes * 0.5));
    base.maxConcurrency = 1;
    base.allowImages = false;
  }

  return base;
}
