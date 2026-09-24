/**
 * lib/offlineWarmingPlanner.ts
 *
 * Decides how aggressive the offline warming pass should be, based on
 * what the browser knows about the current network. Warming is not a
 * one-size-fits-all operation on a network that can be 4G in one minute
 * and 2G in the next, and we have concrete evidence from Gaza users that
 * an unthrottled warming run costs real money and battery (see the
 * 250 -> 65 request reduction in T780).
 *
 * The Network Information API (navigator.connection) is non-standard but
 * widely supported on the platforms that matter here: Chrome/Chromium
 * (Android WebView, most Gaza mobile users), Edge, and recent Firefox.
 * Safari does not expose it. When absent, we default to 'full' — the
 * alternative (defaulting to 'critical') would silently cripple warming
 * on every iPhone user, and Safari users on a bad network can still hit
 * the throttle later via the online/offline fallback paths.
 *
 * The four tiers:
 *   - none      : saveData is on, or we're currently offline.
 *                 Warming is completely skipped. User has explicitly
 *                 asked to conserve data; we honor that.
 *   - critical  : effectiveType is 'slow-2g' or '2g', or downlink is
 *                 below 0.5 Mbps. Only the SW's own precache tier runs
 *                 (handled by sw.js — this module returns an empty
 *                 route list, but does not disable the SW precache).
 *   - core      : effectiveType is '3g', or downlink is below 2 Mbps.
 *                 Only the top 3-4 routes warm (planner filters the
 *                 list, caller applies).
 *   - full      : everything else (4g, wifi, unknown-with-good-signal).
 *                 All routes warm, with modest concurrency.
 *
 * The planner also returns concurrency and inter-route delay, so the
 * warming engine doesn't hammer a slow link with 13 parallel fetches.
 */
'use client';

import { getWarmingMode } from './warmingPreferences';

export type WarmingTier = 'none' | 'critical' | 'core' | 'full';

export interface WarmingPlan {
  tier: WarmingTier;
  /** How many routes to warm in parallel. */
  concurrency: number;
  /** Milliseconds to wait between kicking off concurrent batches. */
  interBatchDelayMs: number;
  /** Milliseconds to wait between individual routes in sequential mode. */
  interRouteDelayMs: number;
  /** Per-request timeout (ms). Short on slow links to fail fast and retry. */
  requestTimeoutMs: number;
  /** Human-readable reason, for logging / debug overlay. */
  reason: string;
}

// ── Network reading ──────────────────────────────────────────────

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  downlink?: number; // Mbps (estimated)
  rtt?: number;      // ms (estimated)
}

function getConnection(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { connection?: NetworkInformationLike };
  return nav.connection ?? null;
}

/**
 * Returns whether the caller is currently online. We treat the
 * `navigator.onLine === false` signal as authoritative for skipping
 * warming entirely — no point issuing fetches that will all throw.
 * (navigator.onLine === true is famously unreliable about whether the
 * network is actually usable — we don't trust it as a positive signal,
 * only as a negative one.)
 */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

// ── The plan ─────────────────────────────────────────────────────

export function getWarmingPlan(): WarmingPlan {
  // SW-WARMING-USER-CONTROL-01: user preference takes top priority.
  // The order of gates below mirrors the doc comment in
  // warmingPreferences.ts exactly.
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

  if (isOffline()) {
    return {
      tier: 'none',
      concurrency: 0,
      interBatchDelayMs: 0,
      interRouteDelayMs: 0,
      requestTimeoutMs: 0,
      reason: 'offline',
    };
  }

  const conn = getConnection();

  // No Network Information API — cannot make a precise decision.
  // Default to 'full' with conservative throttling; if the network is
  // actually slow, the request-timeout + circuit-breaker in the
  // warming engine will degrade gracefully.
  if (!conn) {
    return {
      tier: 'full',
      concurrency: 2,
      interBatchDelayMs: 1500,
      interRouteDelayMs: 800,
      requestTimeoutMs: 20_000,
      reason: 'no-network-info-api',
    };
  }

  // User asked to save data. Absolute stop.
  if (conn.saveData === true) {
    return {
      tier: 'none',
      concurrency: 0,
      interBatchDelayMs: 0,
      interRouteDelayMs: 0,
      requestTimeoutMs: 0,
      reason: 'save-data',
    };
  }

  // SW-WARMING-USER-CONTROL-01: explicit user choice overrides the
  // network-derived decision — but only AFTER the OS-level saveData
  // flag above, so a user who turned on Data Saver at the OS still
  // gets the safe 'none' plan even if they picked 'balanced' here.
  if (userMode === 'saver') {
    return {
      tier: 'critical',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 3000,
      requestTimeoutMs: 15_000,
      reason: 'user-saver',
    };
  }

  if (userMode === 'balanced') {
    return {
      tier: 'core',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 1200,
      requestTimeoutMs: 15_000,
      reason: 'user-balanced',
    };
  }

  const type = conn.effectiveType;
  const downlink = typeof conn.downlink === 'number' ? conn.downlink : null;

  // Very slow link — only the SW precache tier runs (which is
  // initiated separately by sw.js install, not by this planner).
  if (type === 'slow-2g' || type === '2g' || (downlink !== null && downlink < 0.5)) {
    return {
      tier: 'critical',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 3000,
      requestTimeoutMs: 15_000,
      reason: `slow-link(type=${type ?? '?'},downlink=${downlink ?? '?'})`,
    };
  }

  // Mid-range link — warm only the hottest routes, sequentially.
  if (type === '3g' || (downlink !== null && downlink < 2)) {
    return {
      tier: 'core',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 1200,
      requestTimeoutMs: 15_000,
      reason: `mid-link(type=${type ?? '?'},downlink=${downlink ?? '?'})`,
    };
  }

  // Good link. Still cap concurrency — 13 parallel fetches on a phone
  // browser is wasteful even on WiFi.
  return {
    tier: 'full',
    concurrency: 3,
    interBatchDelayMs: 800,
    interRouteDelayMs: 0,
    requestTimeoutMs: 20_000,
    reason: `good-link(type=${type ?? '?'},downlink=${downlink ?? '?'})`,
  };
}

// ── Priority route list ──────────────────────────────────────────

/**
 * SW-PRIORITY-STORAGE-SYNC-01: routes that must reach warming even on
 * the 'core' tier. These are the pages a user with a flaky connection
 * actually needs offline: their inbox, their dashboard, and the two
 * management pages for cache size and the sync queue. Anything else
 * can wait for a good network.
 */
// SW-CORE-BUDGET-8: expanded to cover BOTH personal essentials AND
// the public pages /offline itself advertises. Before this, 'core'
// tier picked the first 5 of CORE_ROUTES positionally, which meant
// /downloads, /saved-ads, /saved-payments were never warmed on a
// typical Gaza mid-range link (1.45 Mbps) — the exact three buttons
// the offline page offers. Now these are in the priority list so
// they're warmed regardless of position or tier budget.
const PRIORITY_ROUTES = [
  // Public offline-floor — the three buttons /offline links to, plus
  // the fallback itself.
  '/offline',
  '/downloads',
  '/saved-ads',
  '/saved-payments',
  // Primary browsing.
  '/',
  '/products',
  '/search',
  // Personal essentials.
  '/messages',
  '/notifications',
  '/dashboard',
  '/settings/storage',
  '/settings/sync',
];

// ── Route selection ──────────────────────────────────────────────

/**
 * Given the full route list warming would like to process, return the
 * subset the current plan allows. Critical-tier routes (the ones the
 * SW precaches directly) are always included — they are the safety
 * net. Beyond that:
 *
 *   full     -> all routes
 *   core     -> first N of the given list (caller is expected to pass
 *               routes in priority order)
 *   critical -> empty (SW precache handles the floor)
 *   none     -> empty
 *
 * The caller is expected to pass the route list in priority order
 * (most important first). This module does not know what "important"
 * means — that's a routing concern — it only knows the budget.
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
      // SW-CORE-BUDGET-8: budget raised from 5 to 8. On a 1.45 Mbps
      // link, 8 route shells cost ~1.5 MB and take ~12 seconds — fine
      // for background warming, and enough to cover the offline-floor
      // plus primary browsing. 5 was too tight and left /downloads,
      // /saved-ads, /saved-payments perpetually uncached.
      const inInput = new Set(routesInPriorityOrder);
      const priority = PRIORITY_ROUTES.filter((r) => inInput.has(r));
      const target = Math.max(8, priority.length);
      if (priority.length >= target) return priority.slice(0, target);
      const remaining = routesInPriorityOrder.filter(
        (r) => !priority.includes(r),
      );
      return [...priority, ...remaining.slice(0, target - priority.length)];
    }
    case 'full':
    default:
      return routesInPriorityOrder;
  }
}

/** True when the plan says "do nothing at all". */
export function isWarmingDisabled(plan: WarmingPlan): boolean {
  return plan.tier === 'none';
}

/**
 * Debug helper — returns a JSON-serializable view of what the planner
 * would decide right now. Used by the (future) ?debug=warming overlay.
 */
export function describePlan(): WarmingPlan & { online: boolean } {
  const plan = getWarmingPlan();
  return { ...plan, online: !isOffline() };
}
