/**
 * lib/offlineWarmingPlanner.ts
 *
 * Decides how aggressive the offline warming pass should be, based on
 * measured network quality (Gaza-first).
 *
 * W0-W3: route scope remains planner-owned, but the global warming budget
 * now caps it again using measured network conditions. This keeps explicit
 * 'full' from bypassing safety limits on unknown/weak links.
 *
 * FIX WARM-PRIORITY-MARKETPLACE-01: PRIORITY_ROUTES ordered by real usage
 * for a classifieds marketplace (browse → search → chat → sell → tools).
 */
'use client';

import { getWarmingMode } from './warmingPreferences';
import { getNetworkPolicy, type NetworkTier } from './networkPolicy';
import { getWarmingBudget } from './warmingBudget';
import { readNavigationUsage } from '@/hooks/useNavigationUsage';

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
  '/my-store/products/new',
  '/my-services/new',
  '/my-store',
  '/my-services',
  // ── 4. User content / actions ─────────────────────────────────
  '/activity',
  // SETTINGS-HUB-01 + HUB-WARMING-CLEANUP-01: the hub route only —
  // the old /settings/* sub-paths redirect and are intentionally absent.
  '/settings',
  '/saved-searches',
  '/saved-payments',
  '/complete-profile',
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
 * 'full' is still the broadest user-selected mode, but the adaptive global
 * budget is an upper bound; weak/unknown links remain intentionally bounded.
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

  const policy = getNetworkPolicy();

  if (policy.tier === 'offline') {
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

  if (policy.saveData) {
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

  if (!policy.allowBackgroundWarming) {
    return {
      tier: 'none',
      concurrency: 0,
      interBatchDelayMs: 0,
      interRouteDelayMs: 0,
      requestTimeoutMs: 0,
      minRoutes: 0,
      reason: policy.consecutiveFailures >= 3 ? 'timeout-circuit' : 'network-policy',
    };
  }

  const criticalPlan = (reason: string): WarmingPlan => ({
    tier: 'critical',
    concurrency: policy.queueConcurrency,
    interBatchDelayMs: 0,
    interRouteDelayMs: policy.tier === 'very-slow' ? 2500 : 1800,
    requestTimeoutMs: policy.requestTimeoutMs,
    minRoutes: ROUTE_BUDGETS.critical.public + ROUTE_BUDGETS.critical.personal,
    reason,
  });

  const networkTier: NetworkTier = policy.tier;

  if (userMode === 'fast') {
    if (networkTier === 'very-slow') return criticalPlan('user-fast-very-slow');
    if (networkTier === 'slow') return criticalPlan('user-fast-slow');
    return {
      tier: 'core',
      concurrency: policy.queueConcurrency,
      interBatchDelayMs: 0,
      interRouteDelayMs: 1200,
      requestTimeoutMs: policy.requestTimeoutMs,
      minRoutes: CORE_ROUTE_BUDGET,
      reason: 'user-fast',
    };
  }

  // userMode === 'full'
  if (networkTier === 'very-slow') {
    return {
      tier: 'full',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 2500,
      requestTimeoutMs: policy.requestTimeoutMs,
      minRoutes: 9_999,
      reason: 'user-full-very-slow-paced',
    };
  }
  if (networkTier === 'slow') {
    return {
      tier: 'full',
      concurrency: 1,
      interBatchDelayMs: 0,
      interRouteDelayMs: 1500,
      requestTimeoutMs: policy.requestTimeoutMs,
      minRoutes: 9_999,
      reason: 'user-full-slow-paced',
    };
  }
  return {
    tier: 'full',
    concurrency: policy.queueConcurrency,
    interBatchDelayMs: policy.tier === 'fast' ? 300 : 500,
    interRouteDelayMs: policy.tier === 'fast' ? 400 : 700,
    requestTimeoutMs: policy.requestTimeoutMs,
    minRoutes: 9_999,
    reason: networkTier === 'fast' ? 'user-full' : 'user-full-adaptive',
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
  const baseImportance = Object.fromEntries(PRIORITY_ROUTES.map((route, index) => [route, 100 - index]));
  const usage = readNavigationUsage();
  const score = (route: string) => {
    const entry = usage[route];
    if (!entry) return baseImportance[route] ?? 0;
    const age = Math.max(0, Date.now() - entry.lastUsed);
    const recency = Math.max(0, 1 - age / (30 * 24 * 60 * 60 * 1000));
    const frequency = Math.min(entry.count, 12) / 12;
    return (baseImportance[route] ?? 0) + recency * 28 + frequency * 18;
  };
  // W7: usage personalizes only the order; the static marketplace importance
  // remains the tie-break baseline, so a frequently visited low-value route
  // cannot consume the entire warming budget.
  const ordered = [...priority, ...remaining].sort((a, b) => {
    const diff = score(b) - score(a);
    return Math.abs(diff) > 0.5 ? diff : a.localeCompare(b);
  });

  const warmingMode = getWarmingMode();
  const adaptive = getWarmingBudget(getNetworkPolicy(), warmingMode === 'full' ? 'full' : 'fast');
  const adaptiveBudget = kind === 'public' ? adaptive.maxRouteCount : adaptive.maxPersonalRouteCount;

  switch (plan.tier) {
    case 'critical':
    case 'core': {
      const staticBudget = ROUTE_BUDGETS[plan.tier][kind];
      return [...pinned, ...ordered.slice(0, Math.min(staticBudget, adaptiveBudget))];
    }
    case 'full':
    default:
      return [...pinned, ...ordered.slice(0, adaptiveBudget)];
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
