import { stableSerialize } from './cacheKey';

/**
 * Single source of truth for the public list queries that the keep-warm loop
 * (shared/utils/cacheWarmup.ts) pre-builds.
 *
 * Why this exists (FIX WARM-LIST-HARD-TTL-01): the public lists share the
 * `publicLive` policy whose hard TTL is 90s, but the keep-warm loop only runs
 * every 240s. A warmed list key therefore expired ~150s before the next cycle
 * and was cold for roughly 60% of every cycle — the warm-up was a no-op for
 * everything except the home keys. (ads.service.ts documented a 600s hard TTL
 * for exactly this reason, but the value was lost when TTLs moved into the
 * central cache policy.)
 *
 * Only these exact first-page shapes get the longer hard TTL. Every filtered /
 * searched / deep-paged key keeps the short policy TTL, so Redis never holds
 * long-lived one-off keys. Hard invalidation still works because it is
 * generation-token based, not TTL based (see swrCache.ts).
 *
 * Keep the shapes identical to the frontend warming contract
 * (frontend/lib/warmingQueryContract.ts) — the cache key is derived from the
 * validated query, so a different shape is a different (cold) key.
 */

/** Must stay below `hardTtl - KEEP_WARM_INTERVAL_MS`-style safety: 600s vs a 240s cycle. */
export const WARMED_LIST_HARD_TTL_SECONDS = 600;

export type WarmedListScope = 'ads' | 'products' | 'stores' | 'service-listings' | 'service-providers';

export const WARMED_ADS_DEFAULT_QUERY = { page: 1, sortBy: 'createdAt', sortOrder: 'desc' } as const;
export const WARMED_ADS_FEATURED_QUERY = { isFeatured: true, limit: 4 } as const;
export const WARMED_PRODUCTS_DEFAULT_QUERY = { page: 1, limit: 12, sortBy: 'createdAt', sortOrder: 'desc' } as const;
/** Home-page product strip: /products?limit=8&sortBy=createdAt&sortOrder=desc */
export const WARMED_PRODUCTS_HOME_QUERY = { limit: 8, sortBy: 'createdAt', sortOrder: 'desc' } as const;
export const WARMED_STORES_DEFAULT_QUERY = { page: 1, sortBy: 'createdAt', sortOrder: 'desc' } as const;
/** Home-page store strip: /stores?limit=6&sortBy=createdAt&sortOrder=desc */
export const WARMED_STORES_HOME_QUERY = { limit: 6, sortBy: 'createdAt', sortOrder: 'desc' } as const;
export const WARMED_SERVICE_LISTINGS_DEFAULT_QUERY = { page: 1, sortBy: 'createdAt', sortOrder: 'desc' } as const;
export const WARMED_SERVICE_PROVIDERS_DEFAULT_QUERY = { page: 1 } as const;

const WARMED_SHAPE_IDS: Readonly<Record<WarmedListScope, ReadonlySet<string>>> = {
  ads: new Set([stableSerialize(WARMED_ADS_DEFAULT_QUERY), stableSerialize(WARMED_ADS_FEATURED_QUERY)]),
  products: new Set([stableSerialize(WARMED_PRODUCTS_DEFAULT_QUERY), stableSerialize(WARMED_PRODUCTS_HOME_QUERY)]),
  stores: new Set([stableSerialize(WARMED_STORES_DEFAULT_QUERY), stableSerialize(WARMED_STORES_HOME_QUERY)]),
  'service-listings': new Set([stableSerialize(WARMED_SERVICE_LISTINGS_DEFAULT_QUERY)]),
  'service-providers': new Set([stableSerialize(WARMED_SERVICE_PROVIDERS_DEFAULT_QUERY)]),
};

export function isWarmedListQuery(scope: WarmedListScope, query: unknown): boolean {
  return WARMED_SHAPE_IDS[scope].has(stableSerialize(query));
}

/**
 * Hard TTL for a list key: the long warmed TTL for the exact shapes keep-warm
 * rebuilds, the policy default for everything else.
 */
export function listHardTtlSec(scope: WarmedListScope, query: unknown, defaultSec: number): number {
  return isWarmedListQuery(scope, query) ? Math.max(defaultSec, WARMED_LIST_HARD_TTL_SECONDS) : defaultSec;
}
