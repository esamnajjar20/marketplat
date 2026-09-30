import { logger } from '../../shared/utils/logger';
import {
  swrGet,
  swrEnsureFresh,
  swrGetWithStatus,
  type SwrOptions,
  type SwrStatus,
} from '../../shared/utils/swrCache'; // HOME-STATUS-HEADER-01
import { homeService, isHomepageDegraded, type HomepageResult } from './home.service';
import { HOME_CITIES, type GetHomepageQuery } from './home.validation';
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
/**
 * FIX HOME-REWARM-CITIES-01: after the general key, the allow-listed city keys
 * are re-warmed too (they were left cold until the next keep-warm cycle, so the
 * first visitor of every city paid the full assembly after each takedown).
 * Sequential with a pause so it never fans out, and at most once per gap so a
 * stream of takedowns can't turn into a stream of 10 city rebuilds.
 */
export const HOME_REWARM_CITY_PAUSE_MS = 150;
export const HOME_REWARM_CITIES_MIN_GAP_MS = 30_000;
/**
 * FIX CACHE-KEEPWARM-AGE-01: keep-warm only rebuilds an entry once it is this
 * old (or missing/invalidated). Must stay below HARD_TTL − keep-warm interval
 * (600s − 240s = 360s) so a key cannot expire between two cycles.
 */
export const HOME_KEEPWARM_MAX_AGE_MS = 300_000;

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

/**
 * HOME-STATUS-HEADER-01: returns the cache verdict (hit | stale | miss |
 * bypass) alongside the payload. The controller surfaces it as
 * `X-App-Cache` so `curl -I` can prove whether Redis SWR actually
 * served the request — without this header, external timing tests
 * cannot distinguish "Redis hit + big JSON" from "DB rebuild".
 */
export function getCachedHomepageWithStatus(
  query: GetHomepageQuery,
): Promise<{ value: HomepageResult; status: SwrStatus }> {
  return swrGetWithStatus(homeOptions(query));
}

/**
 * Keep-warm hook: rebuild only if missing / invalidated / past its soft TTL —
 * or, with `maxAgeMs`, only once the entry is older than that (see
 * swrEnsureFresh).
 */
export function ensureHomepageFresh(
  query: GetHomepageQuery,
  opts: { maxAgeMs?: number } = {},
): Promise<'fresh' | 'refreshed' | 'skipped'> {
  return swrEnsureFresh(homeOptions(query), opts);
}

let rewarmTimer: NodeJS.Timeout | null = null;
// Bumped by every new rewarm run and by cancel, so an older city loop stops.
let rewarmEpoch = 0;
let lastCityRewarmAt = 0;

/** For tests and graceful shutdown: drop a pending post-invalidation rewarm. */
export function cancelPendingHomeRewarm(): void {
  if (rewarmTimer) clearTimeout(rewarmTimer);
  rewarmTimer = null;
  rewarmEpoch += 1;
  lastCityRewarmAt = 0;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function rewarmAfterInvalidation(): Promise<void> {
  const epoch = (rewarmEpoch += 1);
  try {
    await ensureHomepageFresh({ city: undefined });
  } catch (error) {
    logger.warn('[home] post-invalidation rewarm failed', error);
  }

  const now = Date.now();
  if (lastCityRewarmAt !== 0 && now - lastCityRewarmAt < HOME_REWARM_CITIES_MIN_GAP_MS) return;
  lastCityRewarmAt = now;

  for (const city of HOME_CITIES) {
    await sleep(HOME_REWARM_CITY_PAUSE_MS);
    if (epoch !== rewarmEpoch) return; // superseded by a newer invalidation / cancelled
    try {
      await ensureHomepageFresh({ city });
    } catch (error) {
      logger.warn(`[home] post-invalidation rewarm failed for ${city}`, error);
    }
  }
}

onHomeInvalidated(() => {
  if (rewarmTimer) return; // burst of invalidations → one rewarm
  rewarmTimer = setTimeout(() => {
    rewarmTimer = null;
    void rewarmAfterInvalidation();
  }, HOME_REWARM_DELAY_MS);
  rewarmTimer.unref();
});
