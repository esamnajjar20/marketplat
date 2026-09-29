import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { withCacheTimeout } from '../../shared/utils/cacheGuard';
import { HOME_CITIES } from './home.validation';

/**
 * Key naming + invalidation for the GET /home cache.
 *
 * Kept in its own dependency-light module (only redis + the city allow-list)
 * on purpose: home.cache.ts imports home.service, which imports ads.service.
 * ads.service / admin.service need to invalidate the home cache when an ad is
 * taken down, and importing home.cache.ts from them would create an import
 * cycle.
 *
 * FIX HOME-CACHE-VERSION-01: prefix bumped v2 -> v3 because the stored value is
 * now an envelope ({ softExpiresAt, payload }) rather than the bare payload.
 * A version in the key means a deploy that changes the stored shape can never
 * read an old-shape value (old v2 keys just age out via their own TTL).
 */
export const HOME_KEY_PREFIX = 'home:v3:';

export const homeCacheKeyForCity = (city: string | undefined): string =>
  `${HOME_KEY_PREFIX}${city ?? 'general'}`;

/** "general" + every allow-listed city — at most 11 known keys, no SCAN needed. */
export const allHomeCacheKeys = (): string[] => [
  homeCacheKeyForCity(undefined),
  ...HOME_CITIES.map(city => homeCacheKeyForCity(city)),
];

/**
 * Drops every cached homepage so the next request rebuilds from the DB.
 * Call AFTER bumpAdsCacheVersion(): the homepage assembly reads ads through
 * the versioned ads-list cache, so rebuilding before the bump could re-cache
 * the just-removed ad.
 *
 * Best-effort: never throws. If Redis is unreachable the home entries simply
 * age out (soft TTL ~30-40s).
 */
export async function invalidateHomeCache(): Promise<void> {
  try {
    await withCacheTimeout(() => redis.del(...allHomeCacheKeys()));
  } catch (error) {
    logger.warn('Failed to invalidate home cache — stale homepage possible for up to ~40s', error);
  }
}
