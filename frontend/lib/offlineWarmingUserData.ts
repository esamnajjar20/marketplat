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
 *   - Only called when the network is 'full' tier (4G / WiFi). On Gaza's
 *     usual 2G/3G the ~55 KB payload would compete with the shell
 *     warming that has higher priority.
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
'use client';

import { API_BASE_URL } from './constants';
import { reportProgress } from './warmingProgress';
import { runUnderWarmingLock } from './offlineWarmingCoordinator';
import { getWarmingPlan } from './offlineWarmingPlanner';
import { isWarmingCancelled } from './offlineRouteShells';
import { useAuthStore } from '@/store/auth.store';

const USER_DATA_LOCK_NAME = 'marketplat-warming-userdata';

/** Must match sw.js's USER_DATA_CACHE template literally. */
export const USER_DATA_CACHE = 'market-user-data-v42';

/**
 * Endpoints warmed per user. Each entry becomes one fetch + one
 * cache.put. Keep this list small — every added URL is bandwidth on
 * the user's next 4G visit.
 */
const USER_DATA_ENDPOINTS = [
  // Identity
  '/users/me',
  // Dashboard panels
  '/ads/me/stats',
  '/sellers/me/attention',
  '/activity?limit=8',
  // Lists the user actually opens
  '/favorites?page=1&limit=20',
  '/ads/me?page=1&limit=20',
  '/notifications?limit=20',
  '/notifications/unread-count',
  '/conversations?limit=20',
  '/conversations/unread-count',
  // Seller / provider (return 404 for plain buyers — tolerated)
  '/stores/me',
  '/service-providers/me',
  '/sellers/me/profile',
  // Form data for create pages
  '/product-categories',
] as const;

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
  signal: AbortSignal,
): Promise<WarmOneResult> {
  const fullUrl = `${API_BASE_URL}${path}`;
  const usedSession = !!useAuthStore.getState().accessToken;
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

    // FIX WARM-LOGOUT-RACE-01: logout may have run clearSensitiveLocalData()
    // while this request was in flight. Writing now would resurrect the
    // previous user's data after the wipe.
    if (usedSession && !useAuthStore.getState().isAuthenticated) {
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
  }
}

/**
 * Warm every user-data endpoint. Called from OfflineBootstrap after
 * authentication is confirmed. Silent, best-effort, bounded.
 */
export async function warmUserData(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof caches === 'undefined') return;
  if (!navigator.onLine) return;

  const plan = getWarmingPlan();
  // FIX WARM-UNIFY-SELF-01: also warm self profile + category trees into
  // React Query / offline JSON (same data create-forms need offline).
  try {
    const { getQueryClient } = await import('@/lib/queryClient');
    const { warmSelfDataForOffline } = await import('@/lib/offlineSelfWarm');
    await warmSelfDataForOffline(getQueryClient());
  } catch (err) {
    console.warn('[user-data] self-warm failed:', err);
  }

  // FIX WARM-MIN-20-01: run on critical too (sequential, long timeout) so
  // dashboard panels are not empty offline on voucher links. Still skip
  // only when warming is fully disabled.
  if (plan.tier === 'none') return;

  await runUnderWarmingLock(async () => {
    const cache = await caches.open(USER_DATA_CACHE);
    const controller = new AbortController();
    const timeoutMs = plan.tier === 'critical' ? 45_000 : 20_000;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    let completed = 0;
    const total = USER_DATA_ENDPOINTS.length;
    reportProgress('userdata', { active: true, completed: 0, total });

    try {
      // Sequential on critical; modest parallel otherwise.
      const CONCURRENCY = plan.tier === 'critical' ? 1 : plan.tier === 'core' ? 2 : 4;
      const queue: string[] = [...USER_DATA_ENDPOINTS];
      const workers: Promise<void>[] = [];

      for (let i = 0; i < CONCURRENCY; i += 1) {
        workers.push(
          (async () => {
            while (queue.length > 0) {
              if (controller.signal.aborted) return;
              // WARM-RAN-01: respond to the user's Cancel button.
              // Previously only the 20-45s abort timer could stop it.
              if (isWarmingCancelled()) return;
              const path = queue.shift();
              if (!path) return;
              const r = await warmOneEndpoint(path, cache, controller.signal);
              // FIX WARM-PROGRESS-HONEST-01: count only endpoints that
              // actually landed (or legitimately don't apply → 404).
              if (r.ok) completed += 1;
              reportProgress('userdata', { active: true, completed, total });
            }
          })(),
        );
      }
      await Promise.all(workers);
    } finally {
      window.clearTimeout(timeout);
      reportProgress('userdata', { active: false, completed, total });
    }
  }, USER_DATA_LOCK_NAME);
}
