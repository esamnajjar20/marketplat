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
 *   - Responses land in a dedicated cache (market-user-data-v38) that
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

const USER_DATA_LOCK_NAME = 'marketplat-warming-userdata';

/** Must match sw.js's USER_DATA_CACHE template literally. */
export const USER_DATA_CACHE = 'market-user-data-v38';

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

async function warmOneEndpoint(
  path: string,
  cache: Cache,
  signal: AbortSignal,
): Promise<WarmOneResult> {
  const fullUrl = `${API_BASE_URL}${path}`;
  try {
    const res = await fetch(fullUrl, {
      credentials: 'include',
      signal,
    });
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
  // SW-USERDATA-CORE-TIER-01: expanded gate from 'full' only to 'core'
  // and above. Confirmed in production testing: on a 1.45 Mbps link
  // (tier='core'), user-data warming never ran, so the dashboard's
  // DashboardStats and RecentActivityFeed panels showed red error
  // states whenever the user was offline — the shell rendered (via
  // shell warming) but the data inside it did not.
  //
  // Cost analysis: 14 endpoints × ~4 KB = ~55 KB per pass. At 1.45
  // Mbps that is ~0.3 s and ~3.6% on top of a ~1.5 MB shell pass —
  // small enough that the "competes with shell warming" concern that
  // motivated the original gate does not apply. Skipped only for
  // 'none' (off / offline / save-data) and 'critical' (2G, < 0.5
  // Mbps) where the shell floor genuinely is the whole budget.
  if (plan.tier === 'none' || plan.tier === 'critical') return;

  await runUnderWarmingLock(async () => {
    const cache = await caches.open(USER_DATA_CACHE);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    let completed = 0;
    const total = USER_DATA_ENDPOINTS.length;
    reportProgress('userdata', { active: true, completed: 0, total });

    try {
      // Concurrency 4 — modest. Higher starves the page the user is
      // actually looking at.
      const CONCURRENCY = 4;
      const queue: string[] = [...USER_DATA_ENDPOINTS];
      const workers: Promise<void>[] = [];

      for (let i = 0; i < CONCURRENCY; i += 1) {
        workers.push(
          (async () => {
            while (queue.length > 0) {
              if (controller.signal.aborted) return;
              const path = queue.shift();
              if (!path) return;
              await warmOneEndpoint(path, cache, controller.signal);
              completed += 1;
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
