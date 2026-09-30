/**
 * lib/offlineWarmingPlanner.ts
 *
 * Decides how aggressive the offline warming pass should be, based on
 * measured network quality (Gaza-first).
 *
 * FIX WARM-MIN-20-01 (superseded by WARM-DEADCODE-01): the measured-speed
 * tiers this note described are gone; 'fast' warms ROUTE_BUDGETS.core.
 *
 * FIX WARM-PRIORITY-MARKETPLACE-01: PRIORITY_ROUTES ordered by real usage
 * for a classifieds marketplace (browse → search → chat → sell → tools).
 */
'use client';

import { getWarmingMode } from './warmingPreferences';
import { shouldPauseWarming, getAverageRequestMs } from './connectionQuality';

// NOTE: getWarmingPlan() no longer produces 'critical' (see FIX WARM-DEADCODE-01);
// the member stays in the union because downstream consumers and their tests
// still branch on it.
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
 * Marketplace usage order (highest first).
 * Public browse first, then engagement, then seller tools, then utilities.
 */
// WARM-55-PRIORITY-01: ordered by real usage — first the pages a user
// needs offline to browse, then the pages they need to publish, then
// engagement, then settings/misc. `selectRoutesByPlan` walks this list
// in order when a tier has a budget smaller than the route set.
const PRIORITY_ROUTES = [
  // ── 1. Browse (public, most reached) ──────────────────────────
  '/offline',
  '/',
  '/ads',
  '/products',
  '/search',
  '/requests',
  '/stores',
  '/services',
  '/service-providers',
  '/sellers/ranking',
  // QR-share receiver: without it the sender's QR is useless offline.
  '/shared',
  // ── 2. Offline reading tools: now tabs of '/offline' (first above) ──
  // ── 3. Personal essentials: publish + engage ─────────────────
  // FIX WARM-LIGHT-02: reordered so a small personal budget keeps the
  // pages people actually reopen offline (publish a listing / a request,
  // read messages + notifications) before seller-only tools.
  '/ads/create',
  '/requests/new',
  '/messages',
  '/notifications',
  '/favorites',
  '/dashboard',
  '/my-ads',
  '/my-store/products/new',
  '/my-services/new',
  '/my-store',
  '/my-services',
  '/my-requests',
  // ── 4. User content / actions ─────────────────────────────────
  '/activity',
  '/saved-searches',
  '/saved-payments',
  '/complete-profile',
  '/my-reports',
];

/**
 * WARM-PINNED-OFFLINE-01 / OFFLINE-HUB-01: the offline surface is ONE route.
 *
 * '/offline' is the service-worker fallback AND the "مركز الأوفلاين" hub
 * (saved ads, downloads, drafts, sync, storage, warming controls as tabs).
 * It is always warmed first and sits outside the core/critical budgets, on
 * every tier except 'none' (user off / no network / saveData). Its tab bodies
 * are statically imported, so warming its HTML also caches every chunk the
 * tabs need — that is what makes all of them work with no network.
 */
export const PINNED_OFFLINE_ROUTES = ['/offline'] as const;

/**
 * FIX WARM-LIGHT-01: route budgets are PER LIST and per tier.
 *
 * Before, one number (25 / 20) was applied to the public list (18 routes)
 * and to the personal list (~37 routes) SEPARATELY — both under/near the
 * cap for the public list and the personal list being sliced only at 25,
 * so 'fast' ("top 25 pages, ~1 MB") really warmed ~43-55 routes, ~58 files
 * each (≈ 20-30 MB on the device). Anything outside the budget is still
 * cached the first time the user visits it (networkFirstPage) or on demand
 * via the per-row "retry" button in /settings/offline.
 *
 * 'full' (explicit user choice) is unchanged: every known route.
 */
export const ROUTE_BUDGETS = {
  core: { public: 12, personal: 8 },
  critical: { public: 8, personal: 4 },
} as const;

/** Total routes per pass for a tier (public + personal). */
const CORE_ROUTE_BUDGET = ROUTE_BUDGETS.core.public + ROUTE_BUDGETS.core.personal;

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

  // FIX WARM-TIMEOUT-CIRCUIT-01: stop background warming after repeated
  // network failures so we do not keep burning a weak radio.
  if (shouldPauseWarming()) {
    return {
      tier: 'none',
      concurrency: 0,
      interBatchDelayMs: 0,
      interRouteDelayMs: 0,
      requestTimeoutMs: 0,
      minRoutes: 0,
      reason: 'timeout-circuit',
    };
  }

  // FIX WARM-ADAPTIVE-01 / WARM-ADAPTIVE-3G-01: throttle by effectiveType,
  // downlink, and measured RTT. 2g → critical; 3g / high RTT → smaller core.
  const effectiveType = (conn?.effectiveType || '').toLowerCase();
  const downlink = typeof conn?.downlink === 'number' ? conn.downlink : undefined;
  const avgMs = getAverageRequestMs();
  const isVerySlow =
    effectiveType === '2g' ||
    effectiveType === 'slow-2g' ||
    (downlink !== undefined && downlink > 0 && downlink < 0.4);
  const isModeratelySlow =
    !isVerySlow &&
    (effectiveType === '3g' ||
      (downlink !== undefined && downlink > 0 && downlink < 1.5) ||
      (avgMs != null && avgMs >= 2500));

  const criticalPlan = (reason: string): WarmingPlan => ({
    tier: 'critical',
    concurrency: 1,
    interBatchDelayMs: 0,
    interRouteDelayMs: 2500,
    requestTimeoutMs: 25_000,
    minRoutes: ROUTE_BUDGETS.critical.public + ROUTE_BUDGETS.critical.personal,
    reason,
  });

  if (userMode === 'fast') {
    if (isVerySlow) return criticalPlan('user-fast-2g');
    if (isModeratelySlow) {
      return {
        tier: 'critical',
        concurrency: 1,
        interBatchDelayMs: 0,
        interRouteDelayMs: 1800,
        requestTimeoutMs: 20_000,
        minRoutes: ROUTE_BUDGETS.critical.public + ROUTE_BUDGETS.critical.personal,
        reason: 'user-fast-3g',
      };
    }
    return {
      tier: 'core',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 1200,
      requestTimeoutMs: 18_000,
      minRoutes: CORE_ROUTE_BUDGET,
      reason: 'user-fast',
    };
  }

  // userMode === 'full'
  if (isVerySlow) return criticalPlan('user-full-2g');
  if (isModeratelySlow) {
    return {
      tier: 'core',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 1500,
      requestTimeoutMs: 18_000,
      minRoutes: CORE_ROUTE_BUDGET,
      reason: 'user-full-3g',
    };
  }
  return {
    tier: 'full',
    concurrency: 2,
    interBatchDelayMs: 300,
    interRouteDelayMs: 400,
    requestTimeoutMs: 12_000,
    minRoutes: 9_999,
    reason: 'user-full',
  };
}

/**
 * Subset of routes for this plan.
 * FIX WARM-MIN-20-01: critical no longer returns [] — uses minRoutes floor.
 */
export function selectRoutesByPlan(
  plan: WarmingPlan,
  routesInPriorityOrder: string[],
  /** Which list is being selected — each has its own budget on core/critical. */
  kind: 'public' | 'personal' = 'public',
): string[] {
  if (plan.tier === 'none') return [];

  const inInput = new Set(routesInPriorityOrder);
  // WARM-PINNED-OFFLINE-01: المثبّتة أولاً وخارج الميزانية.
  const pinned = (PINNED_OFFLINE_ROUTES as readonly string[]).filter((r) => inInput.has(r));
  const pinnedSet = new Set(pinned);
  const priority = PRIORITY_ROUTES.filter((r) => inInput.has(r) && !pinnedSet.has(r));
  const remaining = routesInPriorityOrder.filter(
    (r) => !pinnedSet.has(r) && !priority.includes(r),
  );
  const ordered = [...priority, ...remaining];

  switch (plan.tier) {
    case 'critical':
    case 'core': {
      const budget = ROUTE_BUDGETS[plan.tier][kind];
      return [...pinned, ...ordered.slice(0, budget)];
    }
    case 'full':
    default:
      return [...pinned, ...ordered];
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
