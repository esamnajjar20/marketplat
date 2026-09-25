/**
 * lib/offlineWarmingPlanner.ts
 *
 * Decides how aggressive the offline warming pass should be, based on
 * measured network quality (Gaza-first).
 *
 * FIX WARM-MIN-20-01: even on slow links we warm at least MIN_WARM_ROUTES
 * shells (sequential, long timeouts) — user requirement for usable offline
 * coverage. Previously `critical` returned zero routes.
 *
 * FIX WARM-PRIORITY-MARKETPLACE-01: PRIORITY_ROUTES ordered by real usage
 * for a classifieds marketplace (browse → search → chat → sell → tools).
 */
'use client';

import { getWarmingMode } from './warmingPreferences';
import { getAverageRequestMs } from './connectionQuality';

export type WarmingTier = 'none' | 'critical' | 'core' | 'full';

export interface WarmingPlan {
  tier: WarmingTier;
  /** How many routes to warm in parallel. */
  concurrency: number;
  /** Milliseconds to wait between kicking off concurrent batches. */
  interBatchDelayMs: number;
  /** Milliseconds to wait between individual routes in sequential mode. */
  interRouteDelayMs: number;
  /** Per-request timeout (ms). Longer on slow links so a shell can finish. */
  requestTimeoutMs: number;
  /** Floor for how many routes this pass should attempt. */
  minRoutes: number;
  /** Human-readable reason, for logging / debug UI. */
  reason: string;
}

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

function readConnection(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  return (
    (navigator as Navigator & { connection?: NetworkInformationLike }).connection ??
    null
  );
}

/**
 * Minimum shells per initial pass — even on voucher-class links.
 * Combined public + personal priority lists are long enough to fill this.
 */
export const MIN_WARM_ROUTES = 20;

/**
 * Marketplace usage order (highest first).
 * Public browse first, then engagement, then seller tools, then utilities.
 */
const PRIORITY_ROUTES = [
  '/offline',
  '/',
  '/ads',
  '/products',
  '/search',
  '/stores',
  '/services',
  '/service-providers',
  '/messages',
  '/notifications',
  '/favorites',
  '/dashboard',
  '/my-ads',
  '/ads/create',
  '/my-store',
  '/my-store/products',
  '/my-services',
  '/requests/new',
  '/settings/sync',
  '/settings/storage',
  '/settings/offline',
  '/saved-ads',
  '/downloads',
  '/activity',
  '/saved-searches',
  '/sellers/ranking',
  '/saved-payments',
  '/my-requests',
  '/complete-profile',
  '/my-reports',
];

/** Max shells on 'core' when list is longer — at least MIN_WARM_ROUTES. */
const CORE_ROUTE_BUDGET = 28;

/** Critical (very slow) still attempts this many, sequentially. */
const CRITICAL_ROUTE_BUDGET = MIN_WARM_ROUTES;

export function getWarmingPlan(): WarmingPlan {
  const userMode = getWarmingMode();

  if (userMode === 'off') {
    return {
      tier: 'none',
      concurrency: 0,
      interBatchDelayMs: 0,
      interRouteDelayMs: 0,
      requestTimeoutMs: 0,
      minRoutes: 0,
      reason: 'user-off',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      tier: 'none',
      concurrency: 0,
      interBatchDelayMs: 0,
      interRouteDelayMs: 0,
      requestTimeoutMs: 0,
      minRoutes: 0,
      reason: 'offline',
    };
  }

  const conn = readConnection();

  if (conn?.saveData) {
    return {
      tier: 'none',
      concurrency: 0,
      interBatchDelayMs: 0,
      interRouteDelayMs: 0,
      requestTimeoutMs: 0,
      minRoutes: 0,
      reason: 'saveData',
    };
  }

  if (userMode === 'drip') {
    return {
      tier: 'core',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 1500,
      requestTimeoutMs: 25_000,
      minRoutes: MIN_WARM_ROUTES,
      reason: 'user-drip',
    };
  }

  if (userMode === 'saver') {
    // Still honors MIN_WARM_ROUTES (20) — sequential + long gaps.
    return {
      tier: 'critical',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 2500,
      requestTimeoutMs: 25_000,
      minRoutes: MIN_WARM_ROUTES,
      reason: 'user-saver',
    };
  }

  if (userMode === 'balanced') {
    return {
      tier: 'core',
      concurrency: 2,
      interBatchDelayMs: 300,
      interRouteDelayMs: 600,
      requestTimeoutMs: 18_000,
      minRoutes: CORE_ROUTE_BUDGET,
      reason: 'user-balanced',
    };
  }

  const avgMs = getAverageRequestMs();

  // Measured very slow: still warm MIN_WARM_ROUTES, just sequential + long gaps.
  if (avgMs != null && avgMs >= 4000) {
    return {
      tier: 'critical',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 2000,
      requestTimeoutMs: 30_000,
      minRoutes: CRITICAL_ROUTE_BUDGET,
      reason: `measured-very-slow(avgMs=${Math.round(avgMs)})`,
    };
  }

  const type = conn?.effectiveType;
  const downlink = typeof conn?.downlink === 'number' ? conn.downlink : null;

  if (
    type === 'slow-2g' ||
    type === '2g' ||
    (downlink !== null && downlink < 0.16)
  ) {
    return {
      tier: 'critical',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 2000,
      requestTimeoutMs: 28_000,
      minRoutes: CRITICAL_ROUTE_BUDGET,
      reason: `voucher-class(type=${type ?? '?'},downlink=${downlink ?? '?'})`,
    };
  }

  if (type === '3g' || (downlink !== null && downlink < 1.5) || (avgMs != null && avgMs >= 1500)) {
    return {
      tier: 'core',
      concurrency: 2,
      interBatchDelayMs: 300,
      interRouteDelayMs: 800,
      requestTimeoutMs: 20_000,
      minRoutes: CORE_ROUTE_BUDGET,
      reason: `mid-slow(type=${type ?? '?'},downlink=${downlink ?? '?'},avgMs=${avgMs != null ? Math.round(avgMs) : '?'})`,
    };
  }

  if (!conn && avgMs == null) {
    return {
      tier: 'core',
      concurrency: 2,
      interBatchDelayMs: 250,
      interRouteDelayMs: 600,
      requestTimeoutMs: 18_000,
      minRoutes: CORE_ROUTE_BUDGET,
      reason: 'no-connection-api-default-core',
    };
  }

  return {
    tier: 'full',
    concurrency: 3,
    interBatchDelayMs: 200,
    interRouteDelayMs: 150,
    requestTimeoutMs: 12_000,
    minRoutes: MIN_WARM_ROUTES,
    reason: `full(type=${type ?? '?'},downlink=${downlink ?? '?'})`,
  };
}

/**
 * Subset of routes for this plan.
 * FIX WARM-MIN-20-01: critical no longer returns [] — uses minRoutes floor.
 */
export function selectRoutesByPlan(
  plan: WarmingPlan,
  routesInPriorityOrder: string[],
): string[] {
  switch (plan.tier) {
    case 'none':
      return [];
    case 'critical':
    case 'core': {
      const budget = Math.max(plan.minRoutes || MIN_WARM_ROUTES, MIN_WARM_ROUTES);
      const inInput = new Set(routesInPriorityOrder);
      const priority = PRIORITY_ROUTES.filter((r) => inInput.has(r));
      if (priority.length >= budget) {
        return priority.slice(0, budget);
      }
      const remaining = routesInPriorityOrder.filter((r) => !priority.includes(r));
      return [...priority, ...remaining].slice(0, budget);
    }
    case 'full':
    default:
      // Prefer priority order, then the rest of the input list.
      {
        const inInput = new Set(routesInPriorityOrder);
        const priority = PRIORITY_ROUTES.filter((r) => inInput.has(r));
        const remaining = routesInPriorityOrder.filter((r) => !priority.includes(r));
        return [...priority, ...remaining];
      }
  }
}

export function getPriorityRoutes(): readonly string[] {
  return PRIORITY_ROUTES;
}

/** True when warming should not run at all (user off / offline / saveData). */
export function isWarmingDisabled(plan: WarmingPlan): boolean {
  return plan.tier === 'none';
}

export function describePlan(): WarmingPlan & { online: boolean } {
  const online = typeof navigator !== 'undefined' && navigator.onLine;
  return { ...getWarmingPlan(), online };
}
