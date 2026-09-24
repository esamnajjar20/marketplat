/**
 * lib/offlineWarmingDebug.ts
 *
 * Read-only introspection for the warming system. Consumed by the
 * /debug/warming page. Nothing here mutates state — the page is a
 * window, not a control panel (aside from the two manual buttons the
 * page itself exposes).
 *
 * Kept out of the production warming modules on purpose: those are
 * already 1000+ lines with careful comments; the diagnostic layer
 * should be independently deletable without touching the engine.
 */
'use client';

import {
  readSnapshot,
  type WarmingSnapshot,
  type RouteWarmingMeta,
} from './offlineWarmingState';
import {
  describePlan,
  type WarmingPlan,
} from './offlineWarmingPlanner';
import { describeCoordination } from './offlineWarmingCoordinator';

export interface RouteReport {
  route: string;
  status: 'pending' | 'complete' | 'failed' | 'missing';
  attempts: number;
  chunks: number;
  warmedAt: number | null;
  lastError: string | null;
}

export interface CacheReport {
  name: string;
  entries: number;
  /** Bytes are estimated from Content-Length when available. May be 0. */
  approxBytes: number;
}

export interface WarmingDebugReport {
  /** When this snapshot was taken (ms since epoch). */
  generatedAt: number;

  /** Live network + plan. */
  online: boolean;
  plan: WarmingPlan & { online: boolean };

  /** Which cross-tab lock mechanism is active. */
  coordination: 'web-locks' | 'localstorage' | 'none';

  /** localStorage warming throttles (per cache version). */
  throttle: {
    routeShells: number;
    personalShells: number;
    coreBundle: number;
  };

  /** IndexedDB snapshot — may be null on a fresh device. */
  snapshot: WarmingSnapshot | null;

  /** Public route warming status (from snapshot.routes). */
  publicRoutes: RouteReport[];
  /** Personal route warming status (routes keyed 'personal:<route>'). */
  personalRoutes: RouteReport[];
  /** Personal routes are nested inside the same routes map. */

  /** liveUrls = chunks/shells the warming pass has confirmed present. */
  liveUrlsCount: number;

  /** Cache Storage introspection. */
  caches: CacheReport[];

  /** Storage estimate from the browser. */
  storage: {
    usage: number;
    quota: number;
    usagePct: number;
  } | null;
}

// ── helpers ─────────────────────────────────────────────────────

const PUBLIC_ROUTES = [
  '/offline',
  '/',
  '/products',
  '/stores',
  '/search',
  '/services',
  '/ads',
  '/saved-ads',
  '/downloads',
  '/saved-payments',
  '/service-providers',
  '/sellers/ranking',
] as const;

const PERSONAL_ROUTES = [
  '/messages',
  '/notifications',
  '/dashboard',
  '/favorites',
  '/my-ads',
  '/activity',
  '/ads/create',
  '/settings',
  '/settings/profile',
  '/settings/security',
  '/settings/sessions',
  '/settings/notifications',
  '/settings/seller',
  '/settings/service-provider',
  '/settings/blocked-users',
  '/settings/storage',
  '/settings/sync',
  '/my-store',
  '/my-store/inventory',
  '/my-store/members',
  '/my-store/products',
  '/my-store/products/new',
  '/my-store/promotions',
  '/my-store/collections',
  '/my-store/analytics',
  '/my-store/settings',
  '/my-services',
  '/my-services/new',
  '/my-services/requests',
  '/my-services/appointments',
  '/my-services/analytics',
  '/my-requests',
  '/requests/new',
] as const;

const CACHE_NAMES = [
  'market-static-v36',
  'market-personal-shell-v36',
  'market-core-v36',
  'market-api-v36',
  'market-images-v36',
  'market-saved-ads',
  'market-warming-staging',
  'market-auto-read-ads',
] as const;

function buildRouteReport(
  route: string,
  meta: RouteWarmingMeta | undefined,
): RouteReport {
  return {
    route,
    status: meta?.status ?? 'missing',
    attempts: meta?.attempts ?? 0,
    chunks: meta?.chunks.length ?? 0,
    warmedAt: meta?.warmedAt ?? null,
    lastError: meta?.lastError ?? null,
  };
}

async function inspectCaches(): Promise<CacheReport[]> {
  if (typeof caches === 'undefined') return [];
  const out: CacheReport[] = [];
  for (const name of CACHE_NAMES) {
    try {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      let approxBytes = 0;
      // Sampling first 30 — walking every response on an 80-entry cache
      // on a slow phone adds up; the sampled average is good enough for
      // a debug readout.
      const sample = keys.slice(0, 30);
      for (const req of sample) {
        try {
          const res = await cache.match(req);
          const len = res?.headers.get('content-length');
          const n = len ? Number(len) : 0;
          if (Number.isFinite(n) && n > 0) approxBytes += n;
        } catch {
          // skip
        }
      }
      if (sample.length > 0 && keys.length > sample.length) {
        approxBytes = Math.round((approxBytes / sample.length) * keys.length);
      }
      out.push({ name, entries: keys.length, approxBytes });
    } catch {
      out.push({ name, entries: 0, approxBytes: 0 });
    }
  }
  return out;
}

async function inspectStorage(): Promise<WarmingDebugReport['storage']> {
  try {
    const nav = navigator as Navigator & {
      storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> };
    };
    if (!nav.storage?.estimate) return null;
    const est = await nav.storage.estimate();
    const usage = est.usage ?? 0;
    const quota = est.quota ?? 0;
    if (quota <= 0) return { usage, quota: 0, usagePct: 0 };
    return {
      usage,
      quota,
      usagePct: Math.round((usage / quota) * 100),
    };
  } catch {
    return null;
  }
}

function readThrottle(): WarmingDebugReport['throttle'] {
  if (typeof localStorage === 'undefined') {
    return { routeShells: 0, personalShells: 0, coreBundle: 0 };
  }
  const read = (k: string): number => {
    try {
      const v = localStorage.getItem(k);
      return v ? Number(v) || 0 : 0;
    } catch {
      return 0;
    }
  };
  return {
    routeShells: read('marketplat:route-shells:last-warmed:v36'),
    personalShells: read('marketplat:personal-shells:last-warmed:v36'),
    coreBundle: read('marketplat:core-bundle:last-warmed:v36'),
  };
}

// ── public API ──────────────────────────────────────────────────

export async function buildWarmingReport(): Promise<WarmingDebugReport> {
  const snapshot = await readSnapshot();
  const plan = describePlan();
  const coordination = describeCoordination();
  const caches = await inspectCaches();
  const storage = await inspectStorage();
  const throttle = readThrottle();

  const routesMap = snapshot?.routes ?? {};

  const publicRoutes = PUBLIC_ROUTES.map((r) =>
    buildRouteReport(r, routesMap[r]),
  );
  const personalRoutes = PERSONAL_ROUTES.map((r) =>
    buildRouteReport(r, routesMap[`personal:${r}`]),
  );

  return {
    generatedAt: Date.now(),
    online: !!(typeof navigator !== 'undefined' && navigator.onLine),
    plan,
    coordination,
    throttle,
    snapshot,
    publicRoutes,
    personalRoutes,
    liveUrlsCount: snapshot?.liveUrls.length ?? 0,
    caches,
    storage,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatAge(ts: number | null): string {
  if (!ts) return '—';
  const ms = Date.now() - ts;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}
