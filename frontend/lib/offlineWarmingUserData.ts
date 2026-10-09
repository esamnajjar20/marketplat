'use client';

/**
 * lib/offlineWarmingUserData.ts
 *
 * PHASE-5 — warming of user-specific API data.
 *
 * The existing warming passes cache page shells (HTML + JS chunks) so
 * the app's structure works offline. This module fills the other half:
 * the data the user actually sees when they open /dashboard, /favorites,
 * /my-ads, /notifications, or /messages.
 *
 * Without this, an offline user on /dashboard sees the page shell but
 * every panel is empty (React Query has no cached responses). With it,
 * the panels have the last values they had when warming last ran.
 *
 * Scope is deliberately narrow:
 *   - Runs on every tier except 'none' (sequential + long timeouts on
 *     slow links), but each endpoint has its OWN freshness window (see
 *     USER_DATA_TTL_MS) — a pass only fetches what is actually due, so the
 *     frequent "tick" calls from OfflineBootstrap cost nothing when fresh.
 *   - Only endpoints the user's own account owns.
 *   - Responses land in a dedicated cache (market-user-data-*) that
 *     is versioned by CACHE_VERSION (see USER_DATA_CACHE below).
 *     COMMENT-V40-STALE-FIX: kept the asterisk so future bumps don't
 *     need to touch this comment.
 *     the SW wipes on logout alongside API_CACHE and PERSONAL_SHELL_CACHE.
 *
 * Cache key format is the FULL request URL (API_BASE_URL + path +
 * querystring), matching exactly what the frontend's axios calls
 * produce, so the SW's networkFirstApi can fall through to it without
 * any transformation.
 */

import { getCurrentOfflineUserId } from '@/lib/offlineUserScope';
import { USER_WARMING_QUERIES } from './warmingQueryContract';
import { recordWarmingTransfer } from './warmingTelemetry';
import { reserveWarmingRequest, recordWarmingRuntimeBytes } from './warmingRuntimeBudget';

import { API_BASE_URL } from './constants';
import { reportProgress } from './warmingProgress';
import { runUnderWarmingLock } from './offlineWarmingCoordinator';
import { getWarmingPlan, isWarmingDisabled } from './offlineWarmingPlanner';
import { isWarmingCancelled } from './offlineRouteShells';
import { useAuthStore } from '@/store/auth.store';
import { SW_CACHE_VERSION, userDataCacheName, USER_DATA_CACHE_PREFIX } from '@/lib/cacheVersion';
// Single source: the prefix lives in lib/cacheVersion.ts, next to
// SW_CACHE_VERSION. Re-exporting avoids a second literal that could silently
// drift from the source of truth.
export { USER_DATA_CACHE_PREFIX };

const USER_DATA_LOCK_NAME = 'marketplat-warming-userdata';

// USER_DATA_CACHE_PREFIX is now imported/re-exported from lib/cacheVersion.ts.

export function getUserDataCacheName(userId: string): string {
  return userDataCacheName(userId);
}

/**
 * FIX WARM-USERDATA-TTL-01: كل مسار له نافذة طزاجة خاصة به. قبل ذلك لم
 * يكن هناك أي throttle: كل فتح تطبيق / online / تسجيل دخول كان يعيد
 * جلب الـ13 مسارًا (+5 طلبات self-warm) حتى لو جُلبت قبل ثوانٍ.
 *
 *   volatile — تتغير بسرعة (رسائل، إشعارات، عدّادات، لوحة التحكم، إعلاناتي)
 *   stable   — تتغير نادرًا (الهوية، ملفات البائع/المتجر/الخدمة، التصنيفات)
 *
 * على الشبكات الضعيفة (critical) تُضرب المدد ×3 لتوفير الباقة.
 */
export type UserDataGroup = 'volatile' | 'stable';

export const USER_DATA_TTL_MS: Record<UserDataGroup, number> = {
  volatile: 10 * 60 * 1000,
  stable: 2 * 60 * 60 * 1000,
};
const CRITICAL_TTL_MULTIPLIER = 3;

/**
 * Endpoints warmed per user, in priority order (what people open offline
 * most first — a pass cut short by a bad link still got the best ones).
 * Each entry becomes one fetch + one cache.put. Keep this list small.
 */
export const USER_DATA_ENDPOINTS: ReadonlyArray<{ path: string; group: UserDataGroup }> = USER_WARMING_QUERIES.map((entry) => ({
  path: entry.path,
  group: ['me', 'my-store', 'my-provider', 'my-seller-profile', 'product-categories'].includes(entry.id)
    ? 'stable'
    : 'volatile',
}));

interface FreshEntry {
  /** Date.now() of the last successful warm. */
  t: number;
  /** HTTP status (200, or 404 = "doesn't apply to this user"). */
  s: number;
}
type FreshMap = Record<string, FreshEntry>;

const CACHE_VERSION_SUFFIX = SW_CACHE_VERSION;

// Keyed by user id: a different account on the same device must never
// inherit "fresh" markers (its cache entries belong to the previous user).
function freshKey(userId: string): string {
  return `marketplat:user-data:fresh:${CACHE_VERSION_SUFFIX}:${userId}`;
}

function readFreshMap(userId: string): FreshMap {
  try {
    const raw = localStorage.getItem(freshKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as FreshMap) : {};
  } catch {
    return {};
  }
}

function writeFreshMap(userId: string, map: FreshMap): void {
  try {
    localStorage.setItem(freshKey(userId), JSON.stringify(map));
  } catch {
    // private mode / quota — next pass simply re-fetches.
  }
}

/**
 * Pure: which endpoints are due? `hasCachedBody(path)` lets the caller
 * confirm the body is really in the cache (logout wipes the cache but not
 * localStorage) — 404 markers have no body by design and skip that check.
 */
export function pickDueEndpoints(
  map: FreshMap,
  opts: {
    now: number;
    force: boolean;
    critical: boolean;
    hasCachedBody: (path: string) => boolean;
  },
): Array<{ path: string; group: UserDataGroup }> {
  if (opts.force) return [...USER_DATA_ENDPOINTS];
  const mult = opts.critical ? CRITICAL_TTL_MULTIPLIER : 1;
  return USER_DATA_ENDPOINTS.filter(({ path, group }) => {
    const entry = map[path];
    if (!entry) return true;
    // A remembered 404 ("no store / no provider profile yet") re-checks on
    // the SHORT window: the user may create that profile at any moment and
    // must not wait hours for it to reach the offline cache.
    const ttl = entry.s === 404 ? USER_DATA_TTL_MS.volatile : USER_DATA_TTL_MS[group];
    if (opts.now - entry.t >= ttl * mult) return true;
    if (entry.s === 404) return false;
    return !opts.hasCachedBody(path);
  });
}

interface WarmOneResult {
  ok: boolean;
  status: number;
}

/**
 * FIX WARM-AUTH-01: the backend's `authenticate` middleware accepts a
 * Bearer token ONLY (no cookie fallback), so the previous
 * `credentials: 'include'` request returned 401 for every personal
 * endpoint — nothing was cached, yet the progress counter still
 * advanced and the UI reported the pass as complete. The request now
 * carries `Authorization: Bearer <accessToken>`; on a 401 it refreshes
 * the session once (shared refresh, so it never races the app's own
 * axios refresh) and retries.
 */
async function fetchWithAuth(
  fullUrl: string,
  signal: AbortSignal,
  allowRefresh: boolean,
): Promise<Response> {
  if (!reserveWarmingRequest()) throw new Error('warming-request-budget-exhausted');
  const token = useAuthStore.getState().accessToken;
  // No session: still request (public endpoints such as /product-categories
  // keep warming for guests); personal endpoints simply answer 401 and are
  // not cached.
  const res = await fetch(fullUrl, {
    credentials: 'include',
    headers: token
      ? { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      : { Accept: 'application/json' },
    signal,
  });
  if (res.status === 401 && token && allowRefresh) {
    try {
      const { refreshSessionShared } = await import('@/api/client');
      await refreshSessionShared();
    } catch {
      return res; // session really ended — surface the 401
    }
    return fetchWithAuth(fullUrl, signal, false);
  }
  return res;
}

async function warmOneEndpoint(
  path: string,
  cache: Cache,
  timeoutMs: number,
  expectedUserId: string,
): Promise<WarmOneResult> {
  const fullUrl = `${API_BASE_URL}${path}`;
  const usedSession = !!useAuthStore.getState().accessToken;
  // FIX WARM-USERDATA-TIMEOUT-01: per-REQUEST deadline. One shared timer
  // (20s / 45s) used to cover the whole sequential pass, so on a slow link
  // the tail endpoints were aborted on every run and never landed.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;
  try {
    const res = await fetchWithAuth(fullUrl, signal, true);
    // 404 for endpoints that don't apply to this user (a plain buyer
    // has no /stores/me) is a normal outcome, not a failure. Do NOT
    // cache it — caching a 404 would be served offline in place of a
    // proper miss, misleading the page.
    if (res.status === 404) return { ok: true, status: 404 };
    if (!res.ok) return { ok: false, status: res.status };

    // Only cache JSON — an HTML response here is a captive portal or
    // an auth redirect rendered as 200.
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { ok: false, status: res.status };

    const headers = new Headers(res.headers);
    headers.set('X-SW-Cached-At', String(Date.now()));
    const body = await res.clone().blob();
    if (body.size > 0) {
      recordWarmingRuntimeBytes(body.size);
      recordWarmingTransfer(fullUrl.split('?')[0] ?? fullUrl, body.size);
    }

    // FIX WARM-LOGOUT-RACE-01: logout may have run clearSensitiveLocalData()
    // while this request was in flight. Writing now would resurrect the
    // previous user's data after the wipe.
    // Account switching is not equivalent to logout: isAuthenticated may
    // remain true while another user becomes active. Never write a response
    // fetched under the previous account into its offline cache after scope
    // changes (and never resurrect that account's cache after logout).
    if (getCurrentOfflineUserId() !== expectedUserId
      || (usedSession && !useAuthStore.getState().isAuthenticated)) {
      return { ok: false, status: 0 };
    }

    const toStore = new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
    // Key with the FULL URL (same shape axios produces), so the SW's
    // networkFirstApi's `cache.match(request)` finds it unchanged.
    await cache.put(fullUrl, toStore);
    return { ok: true, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Warm the user-data endpoints that are DUE. Called from the warming
 * pipeline after authentication is confirmed. Silent, best-effort, bounded.
 *
 * `force` (manual "warm now" button) ignores the freshness windows.
 */
export async function warmUserData(options: { force?: boolean } = {}): Promise<void> {
  const warmUserId = getCurrentOfflineUserId();
  if (!warmUserId) return;
  if (typeof window === 'undefined') return;
  if (typeof caches === 'undefined') return;
  if (!navigator.onLine) return;

  const force = options.force === true;
  const plan = getWarmingPlan();
  // FIX WARM-USERDATA-GUARD-01: this check used to come AFTER the
  // self-warm block, so users who switched warming off (or have Data
  // Saver on) still paid ~5 background requests on every pass. Nothing
  // may hit the network before the plan says warming is allowed.
  if (isWarmingDisabled(plan)) return;

  const userId = useAuthStore.getState().user?.id ?? 'anon';
  const critical = plan.tier === 'critical';

  await runUnderWarmingLock(async () => {
    const cache = await caches.open(getUserDataCacheName(userId));
    const map = readFreshMap(userId);

    // Pre-compute which cached bodies really exist (logout wipes the
    // cache but not localStorage markers).
    const present = new Set<string>();
    for (const { path } of USER_DATA_ENDPOINTS) {
      if (await cache.match(`${API_BASE_URL}${path}`)) present.add(path);
    }
    const due = pickDueEndpoints(map, {
      now: Date.now(),
      force,
      critical,
      hasCachedBody: (path) => present.has(path),
    });
    if (due.length === 0) return; // nothing stale → no requests, no UI flicker

    // FIX WARM-UNIFY-SELF-01: self profile + category trees into React
    // Query / offline JSON (create-forms need them offline). Only when a
    // "stable" endpoint is due — they share that freshness window.
    if (due.some((d) => d.group === 'stable')) {
      try {
        const { getQueryClient } = await import('@/lib/queryClient');
        const { warmSelfDataForOffline } = await import('@/lib/offlineSelfWarm');
        if (getCurrentOfflineUserId() !== userId) return;
        await warmSelfDataForOffline(getQueryClient(), userId);
      } catch (err) {
        console.warn('[user-data] self-warm failed:', err);
      }
    }

    const timeoutMs = critical ? 45_000 : 20_000;
    let completed = 0;
    const total = due.length;
    reportProgress('userdata', { active: true, completed: 0, total });

    try {
      // Sequential on critical; modest parallel otherwise.
      const CONCURRENCY = critical ? 1 : plan.tier === 'core' ? 2 : 4;
      const queue = [...due];
      const workers: Promise<void>[] = [];

      for (let i = 0; i < CONCURRENCY; i += 1) {
        workers.push(
          (async () => {
            while (queue.length > 0) {
              // WARM-RAN-01: respond to the user's Cancel button.
              if (isWarmingCancelled()) return;
              const next = queue.shift();
              if (!next) return;
              const r = await warmOneEndpoint(next.path, cache, timeoutMs, userId);
              // FIX WARM-PROGRESS-HONEST-01: count only endpoints that
              // actually landed (or legitimately don't apply → 404).
              if (r.ok) completed += 1;
              if (r.ok) map[next.path] = { t: Date.now(), s: r.status };
              reportProgress('userdata', { active: true, completed, total });
            }
          })(),
        );
      }
      await Promise.all(workers);
    } finally {
      // Only persist markers for the account that is still signed in.
      if ((useAuthStore.getState().user?.id ?? 'anon') === userId) {
        writeFreshMap(userId, map);
      }
      reportProgress('userdata', { active: false, completed, total });
    }
  }, USER_DATA_LOCK_NAME);
}
