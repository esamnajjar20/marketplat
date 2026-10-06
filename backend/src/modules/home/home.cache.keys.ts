import { logger } from '../../shared/utils/logger';
import { bumpGeneration } from '../../shared/utils/swrCache';
import { HOME_CITIES } from './home.validation';

/**
 * Key naming + invalidation for the GET /home cache.
 *
 * Kept in its own dependency-light module (only the SWR engine + the city
 * allow-list) on purpose: home.cache.ts imports home.service, which imports
 * ads.service. ads.service / admin.service need to invalidate the home cache
 * when an ad is taken down, and importing home.cache.ts from them would create
 * an import cycle.
 *
 * prefix bumped v2 -> v3 (envelope shape).
 * v3 -> v4 — envelopes are now stamped with a
 * generation token (see swrCache.ts) instead of being invalidated by DEL.
 */
export const HOME_KEY_PREFIX = 'home:v4:';

/** One generation for the whole homepage family (general + every city). */
export const HOME_GEN_KEY = 'home:gen';

export const homeCacheKeyForCity = (city: string | undefined): string =>
  `${HOME_KEY_PREFIX}${city ?? 'general'}`;

/** "general" + every allow-listed city — at most 11 known keys, no SCAN needed. */
export const allHomeCacheKeys = (): string[] => [
  homeCacheKeyForCity(undefined),
  ...HOME_CITIES.map(city => homeCacheKeyForCity(city)),
];

type InvalidationListener = () => void;
const listeners = new Set<InvalidationListener>();

/**
 * Lets home.cache.ts (which this module must not import) re-warm the general
 * homepage right after an invalidation, so the first visitor after a takedown
 * doesn't pay the synchronous rebuild.
 */
export const onHomeInvalidated = (listener: InvalidationListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Invalidates every cached homepage. Call AFTER bumpAdsCacheHard(): the
 * homepage assembly reads ads through the ads-list cache, so rebuilding before
 * that bump could re-cache the just-removed ad.
 *
 * this used to DEL the keys. A background refresh that
 * had started before the DEL could still SET its (pre-removal) result after
 * it, putting the removed ad back on the homepage for 30-40s. Now it overwrites
 * a generation token; envelopes stamped with the old token are ignored by
 * readers no matter when they were written.
 *
 * Best-effort: never throws. If Redis is unreachable the entries simply age
 * out (soft TTL ~30-40s).
 */
export async function invalidateHomeCache(): Promise<void> {
  const ok = await bumpGeneration(HOME_GEN_KEY);
  if (!ok) {
    logger.warn('Failed to invalidate home cache — stale homepage possible for up to ~40s');
    return;
  }
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      logger.warn('[home] invalidation listener failed', error);
    }
  }
}
