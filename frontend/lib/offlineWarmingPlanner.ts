/**
 * lib/offlineWarmingPlanner.ts
 *
 * Decides how aggressive the offline warming pass should be, based on
 * what the browser knows about the current network.
 *
 * Gaza context (primary audience for aggressive throttling):
 *   Prepaid voucher cards commonly sustain only 17–30 KB/s
 *   (~0.14–0.24 Mbps). The Network Information API often lies on these
 *   links (reports "3g"/"4g" while real throughput is 2g-class). We
 *   therefore:
 *     1. Prefer measured request timings (getAverageRequestMs) over
 *        effectiveType when samples exist.
 *     2. Treat downlink < 0.16 Mbps as critical (DRIP-TIERS-02-COMMENT).
 *     3. Keep core-tier budgets tiny (3–4 shells) and sequential.
 *     4. When the API is absent (Safari), default to 'core' — not 'full'
 *        — so an iPhone on a bad hotspot does not burn a voucher.
 *
 * The four tiers:
 *   - none      : saveData / offline / user mode off
 *   - critical  : ~17–30 KB/s territory — no app-driven route warming
 *   - core      : mid-slow — a handful of priority shells only
 *   - full      : truly good link — full list, still modest concurrency
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
 * SW-CORE-BUDGET: priority floor for 'core' tier.
 * Must cover what /offline itself advertises + primary browse + a few
 * personal essentials. Kept short on purpose — each extra shell on a
 * 20 KB/s link is ~10–30s of exclusive bandwidth.
 */
const PRIORITY_ROUTES = [
  '/offline',
  '/downloads',
  '/saved-ads',
  '/saved-payments',
  '/',
  '/products',
  '/search',
  '/messages',
  '/notifications',
  '/dashboard',
  '/settings/storage',
  '/settings/sync',
];

/** Max shells warmed on 'core' tier (Gaza mid-slow). Was 8 — too heavy at 20 KB/s. */
const CORE_ROUTE_BUDGET = 4;

export function getWarmingPlan(): WarmingPlan {
  const userMode = getWarmingMode();

  if (userMode === 'off') {
    return {
      tier: 'none',
      concurrency: 0,
      interBatchDelayMs: 0,
      interRouteDelayMs: 0,
      requestTimeoutMs: 0,
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
      reason: 'saveData',
    };
  }

  // User forced modes beat network heuristics (except off/saveData above).
  // Drip: user chose slow background fill — always allow a small
  // sequential batch. Route selection + 12-min interval live in
  // offlineRouteShells (DRIP_BUDGET / DRIP_INTERVAL_MS), not here.
  if (userMode === 'drip') {
    return {
      tier: 'core',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 3000,
      requestTimeoutMs: 25_000,
      reason: 'user-drip',
    };
  }

  if (userMode === 'saver') {
    return {
      tier: 'critical',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 4000,
      requestTimeoutMs: 20_000,
      reason: 'user-saver',
    };
  }

  if (userMode === 'balanced') {
    return {
      tier: 'core',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 2500,
      requestTimeoutMs: 20_000,
      reason: 'user-balanced',
    };
  }

  // Measured timings beat optimistic effectiveType on voucher cards.
  const avgMs = getAverageRequestMs();
  if (avgMs != null && avgMs >= 4000) {
    return {
      tier: 'critical',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 4000,
      requestTimeoutMs: 25_000,
      reason: `measured-very-slow(avgMs=${Math.round(avgMs)})`,
    };
  }

  const type = conn?.effectiveType;
  const downlink = typeof conn?.downlink === 'number' ? conn.downlink : null;

  // DRIP-TIERS-02: threshold lowered from 0.35 Mbps (~45 KB/s) to
  // 0.16 Mbps (~20 KB/s) so 20-45 KB/s links go through the 'core'
  // tier (10 routes / 10 min) instead of being silently disabled.
  // Below ~20 KB/s a single shell still starves the current page, so
  // critical remains the correct tier.
  if (
    type === 'slow-2g' ||
    type === '2g' ||
    (downlink !== null && downlink < 0.16)
  ) {
    return {
      tier: 'critical',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 4000,
      requestTimeoutMs: 25_000,
      reason: `voucher-class(type=${type ?? '?'},downlink=${downlink ?? '?'})`,
    };
  }

  // Mid-slow (classic 3g / <1.5 Mbps) — tiny sequential budget.
  if (type === '3g' || (downlink !== null && downlink < 1.5) || (avgMs != null && avgMs >= 1500)) {
    return {
      tier: 'core',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 2500,
      requestTimeoutMs: 20_000,
      reason: `mid-slow(type=${type ?? '?'},downlink=${downlink ?? '?'},avgMs=${avgMs != null ? Math.round(avgMs) : '?'})`,
    };
  }

  // No Network Information API (Safari) and no timing samples yet:
  // default to core, not full — avoids burning a weak hotspot on first load.
  if (!conn && avgMs == null) {
    return {
      tier: 'core',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 2000,
      requestTimeoutMs: 18_000,
      reason: 'no-connection-api-default-core',
    };
  }

  // Genuinely good link.
  return {
    tier: 'full',
    concurrency: 2,
    interBatchDelayMs: 400,
    interRouteDelayMs: 400,
    requestTimeoutMs: 12_000,
    reason: `full(type=${type ?? '?'},downlink=${downlink ?? '?'})`,
  };
}

/**
 * Given the full route list warming would like to process, return the
 * subset the current plan allows.
 *
 *   full     -> all routes
 *   core     -> priority floor (≤ CORE_ROUTE_BUDGET), then fill from input
 *   critical -> empty (SW precache handles the floor)
 *   none     -> empty
 */
export function selectRoutesByPlan(
  plan: WarmingPlan,
  routesInPriorityOrder: string[],
): string[] {
  switch (plan.tier) {
    case 'none':
    case 'critical':
      return [];
    case 'core': {
      const inInput = new Set(routesInPriorityOrder);
      const priority = PRIORITY_ROUTES.filter((r) => inInput.has(r));
      if (priority.length >= CORE_ROUTE_BUDGET) {
        return priority.slice(0, CORE_ROUTE_BUDGET);
      }
      const remaining = routesInPriorityOrder.filter((r) => !priority.includes(r));
      return [...priority, ...remaining].slice(0, CORE_ROUTE_BUDGET);
    }
    case 'full':
    default:
      return routesInPriorityOrder;
  }
}

export function getPriorityRoutes(): readonly string[] {
  return PRIORITY_ROUTES;
}


/** True when the plan says warming should not run at all. */
export function isWarmingDisabled(plan: WarmingPlan): boolean {
  return plan.tier === 'none';
}

// SW-FIX-DRIP-RESTORE-DESCRIBE: describePlan was removed during the
// voucher-class refactor but offlineWarmingDebug.ts:21 still imports
// it. Re-added here as a thin wrapper — the debug page reads .tier,
// .reason, and .online directly, so the shape must stay
// WarmingPlan & { online: boolean }.
export function describePlan(): WarmingPlan & { online: boolean } {
  const online = typeof navigator !== 'undefined' && navigator.onLine;
  return { ...getWarmingPlan(), online };
}
