import { logger } from '../../shared/utils/logger';
import { swrGet, swrEnsureFresh, type SwrOptions } from '../../shared/utils/swrCache';
import { homeService, isHomepageDegraded, type HomepageResult } from './home.service';
import type { GetHomepageQuery } from './home.validation';
import { homeCacheKeyForCity, HOME_GEN_KEY, onHomeInvalidated } from './home.cache.keys';

/**
 * Stale-while-revalidate cache for the assembled GET /home payload.
 *
 * /home is public and identical for every viewer; the payload only varies by
 * the allow-listed `city` (≤ 11 distinct keys). The mechanics (envelope with a
 * soft expiry, cross-process refresh lock, per-process singleflight,
 * generation-token invalidation, circuit-broken Redis) live in
 * shared/utils/swrCache.ts and are shared with the other public caches.
 *
 * - Only complete (non-degraded) payloads are cached, so a partial failure
 *   heals on the next request instead of being pinned.
 * - invalidateHomeCache() (home.cache.keys.ts) bumps the generation, so an
 *   urgent takedown takes the synchronous path and is never served stale, and
 *   an in-flight refresh that started before it can never resurrect the data.
 */
export const HOME_CACHE_TTL_SECONDS = 30; // soft TTL: after this the entry is "stale"
// FIX HOME-CACHE-JITTER-01: spread the ≤11 keys so their assemblies don't all
// re-run at the same instant each window.
export const HOME_CACHE_TTL_JITTER_SECONDS = 10;
/** How long a stale entry may still be served while a refresh is pending/failing. */
export const HOME_CACHE_HARD_TTL_SECONDS = 600;
/** Upper bound for one background rebuild; released early when it finishes. */
export const HOME_REFRESH_LOCK_TTL_MS = 15_000;
/** After an invalidation, wait briefly (coalescing bursts) then re-warm the general homepage. */
export const HOME_REWARM_DELAY_MS = 1_500;

const ttlWithJitterMs = (): number =>
  (HOME_CACHE_TTL_SECONDS + Math.floor(Math.random() * (HOME_CACHE_TTL_JITTER_SECONDS + 1))) * 1000;

export const homeCacheKey = (query: GetHomepageQuery): string => homeCacheKeyForCity(query.city);

const homeOptions = (query: GetHomepageQuery): SwrOptions<HomepageResult> => ({
  name: 'home',
  key: homeCacheKey(query),
  hardGenKey: HOME_GEN_KEY,
  softTtlMs: ttlWithJitterMs,
  hardTtlSec: HOME_CACHE_HARD_TTL_SECONDS,
  lockTtlMs: HOME_REFRESH_LOCK_TTL_MS,
  build: () => homeService.getHomepage(query),
  shouldCache: payload => !isHomepageDegraded(payload),
});

export function getCachedHomepage(query: GetHomepageQuery): Promise<HomepageResult> {
  return swrGet(homeOptions(query));
}

/** Keep-warm hook: rebuild only if missing / invalidated / past its soft TTL. */
export function ensureHomepageFresh(
  query: GetHomepageQuery,
): Promise<'fresh' | 'refreshed' | 'skipped'> {
  return swrEnsureFresh(homeOptions(query));
}

let rewarmTimer: NodeJS.Timeout | null = null;

/** For tests and graceful shutdown: drop a pending post-invalidation rewarm. */
export function cancelPendingHomeRewarm(): void {
  if (rewarmTimer) clearTimeout(rewarmTimer);
  rewarmTimer = null;
}

onHomeInvalidated(() => {
  if (rewarmTimer) return; // burst of invalidations → one rewarm
  rewarmTimer = setTimeout(() => {
    rewarmTimer = null;
    ensureHomepageFresh({ city: undefined }).catch(error => {
      logger.warn('[home] post-invalidation rewarm failed', error);
    });
  }, HOME_REWARM_DELAY_MS);
  rewarmTimer.unref();
});
