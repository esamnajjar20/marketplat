import { createHash } from 'crypto';
import { swrGetWithStatus, bumpGeneration, type SwrStatus } from '../../shared/utils/swrCache';
import { onHomeInvalidated } from '../home/home.cache.keys';
import type { GetRecommendationsQuery } from './recommendations.validation';

/**
 * RECS-CACHE-01: Redis SWR cache for GET /recommendations.
 *
 * Before this, every request ran the full signal gathering + ranking
 * (up to ~6 queries) against Postgres — measured as the slowest public
 * endpoint (~0.48s). The mechanics (soft/hard TTL, singleflight,
 * cross-process refresh lock, circuit-broken Redis) come from
 * shared/utils/swrCache.ts, same as /home and the public lists.
 *
 * Correctness model:
 *  - Guests share one entry per distinct query ("g" scope). A signed-in
 *    caller gets their OWN entry ("u:<userId>"): the identity comes from
 *    a verified JWT, so one user's rail can never be served to another.
 *  - The key is derived from the NORMALIZED query (lat/lng rounded), and
 *    that same normalized query is what the builder receives, so a
 *    cached value always corresponds to its key.
 *  - Hard invalidation rides on the homepage invalidation: every
 *    takedown path (delete / block / suspend / status away from ACTIVE)
 *    already calls invalidateHomeCache(), so a hidden entity leaves the
 *    rails immediately instead of lingering for the TTL.
 *  - Free-text `city` longer than RECS_MAX_CACHEABLE_CITY is near-unique
 *    per caller, so it is served from the DB (still singleflighted)
 *    rather than filling Redis with one-off keys.
 *  - Cache-Control stays CACHE.NONE on the route (response varies per
 *    Bearer) — this is a server-side cache only.
 */
export const RECS_KEY_PREFIX = 'recs:v1:';
export const RECS_GEN_KEY = 'recs:gen';
export const RECS_SOFT_TTL_MS = 60_000;
export const RECS_SOFT_JITTER_MS = 10_000;
export const RECS_GUEST_HARD_TTL_SECONDS = 300;
export const RECS_USER_HARD_TTL_SECONDS = 120;
export const RECS_LOCK_TTL_MS = 10_000;
export const RECS_MAX_CACHEABLE_CITY = 24;
/** 2 decimals ≈ 1.1 km: fine for a distance *ranking* signal, bounded key space. */
const COORD_DECIMALS = 2;

const roundCoord = (n: number): number => Number(n.toFixed(COORD_DECIMALS));

/** Canonical query: trimmed city, rounded coordinates. Pass THIS to the builder. */
export const normalizeRecommendationsQuery = (
  query: GetRecommendationsQuery,
): GetRecommendationsQuery => {
  const city = query.city?.trim();
  return {
    ...query,
    ...(city ? { city } : { city: undefined }),
    ...(query.lat !== undefined && { lat: roundCoord(query.lat) }),
    ...(query.lng !== undefined && { lng: roundCoord(query.lng) }),
  };
};

export const recommendationsCacheKey = (
  query: GetRecommendationsQuery,
  userId: string | null,
): string => {
  const body = [
    query.type ?? 'ad',
    query.limit ?? '',
    query.city ?? '',
    query.excludeAdId ?? '',
    query.excludeProductId ?? '',
    query.excludeServiceListingId ?? '',
    query.excludeStoreId ?? '',
    query.lat ?? '',
    query.lng ?? '',
  ].join('|');
  const digest = createHash('sha1').update(body).digest('hex');
  return `${RECS_KEY_PREFIX}${userId ? `u:${userId}` : 'g'}:${digest}`;
};

const isCacheable = (query: GetRecommendationsQuery): boolean =>
  (query.city?.length ?? 0) <= RECS_MAX_CACHEABLE_CITY;

/**
 * `shouldCache` lets a caller refuse to pin a degraded value (the mixed
 * shelf returns null for a failed rail; it must heal on the next request,
 * not be served for the TTL).
 *
 * `build` receives the normalized query and MUST resolve the caller from
 * `userId` (not from the request's Bearer header) — see the service's
 * userIdOverride for why.
 */
export function getCachedRecommendations<T>(
  query: GetRecommendationsQuery,
  userId: string | null,
  build: (normalized: GetRecommendationsQuery) => Promise<T>,
  shouldCache?: (value: T) => boolean,
): Promise<{ value: T; status: SwrStatus }> {
  const normalized = normalizeRecommendationsQuery(query);
  return swrGetWithStatus<T>({
    name: 'recommendations',
    key: recommendationsCacheKey(normalized, userId),
    hardGenKey: RECS_GEN_KEY,
    softTtlMs: () => RECS_SOFT_TTL_MS + Math.floor(Math.random() * (RECS_SOFT_JITTER_MS + 1)),
    hardTtlSec: userId ? RECS_USER_HARD_TTL_SECONDS : RECS_GUEST_HARD_TTL_SECONDS,
    lockTtlMs: RECS_LOCK_TTL_MS,
    build: () => build(normalized),
    ...(shouldCache && { shouldCache }),
    cacheable: isCacheable(normalized),
  });
}

// Every takedown already invalidates the homepage; piggy-back on it so
// hidden ads/products/stores/services disappear from the rails at once.
// (Kept in this module, loaded via the controller at boot, so home.cache.keys
// never has to import the recommendations module.)
onHomeInvalidated(() => {
  void bumpGeneration(RECS_GEN_KEY);
});
