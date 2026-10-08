import { canonicalCacheKey, canonicalGenerationKey } from '../cache/cacheKey';
import { getCacheDomain } from '../cache/cacheContract';
import { swrGet, bumpGeneration } from './swrCache';
import { invalidateHomeCache } from '../../modules/home/home.cache.keys';
import { cachePolicy } from '../cache/cachePolicy';

/**
 * Redis SWR cache for the public browse lists of
 * stores, products, service listings and service providers.
 *
 * Before this, only ads and categories had a cache. The homepage was the only
 * thing protecting the other four, so direct browsing pages (/stores,
 * /products, /service-listings, /service-providers, plus every homepage
 * rebuild) hit Postgres on every request.
 *
 * Correctness model:
 *  - keys are derived from the full validated query, so a filter can never
 *    return another filter's page;
 *  - only viewer-independent lists go through here (callers pass the same
 *    validated query object their controller already passed to the service);
 *  - freshness: soft TTL ~20-25s (stale served while ONE process refreshes),
 *    hard TTL 90s. That is well inside the 90s+60s browser Cache-Control these
 *    routes already send (CACHE.SHORT), so the server cache adds no staleness
 *    a client wasn't already allowed to see;
 *  - two invalidation strengths, same model as the /ads list cache:
 *      bumpPublicListCache(ns)  — SOFT: an edit (name, photo, stock...). The
 *        previous page is served once while ONE process refreshes it, so a
 *        burst of edits never becomes a burst of synchronous rebuilds.
 *      hidePublicEntities(ns)   — HARD (+ homepage): delete, block, suspend,
 *        status change away from ACTIVE. Every cached page of that namespace
 *        becomes unusable immediately (generation token, see swrCache.ts).
 *    Both are called AFTER the DB write.
 */
export type PublicListNamespace =
  | 'stores'
  | 'products'
  | 'service-listings'
  | 'service-providers';

export const ALL_PUBLIC_LIST_NAMESPACES: readonly PublicListNamespace[] = [
  'stores',
  'products',
  'service-listings',
  'service-providers',
];

const PUBLIC_LIST_POLICY = cachePolicy('publicLive').server;
export const PUBLIC_LIST_SOFT_TTL_MS = PUBLIC_LIST_POLICY.softTtlMs;
export const PUBLIC_LIST_SOFT_JITTER_MS = PUBLIC_LIST_POLICY.softJitterMs;
export const PUBLIC_LIST_HARD_TTL_SECONDS = PUBLIC_LIST_POLICY.hardTtlSec;
export const PUBLIC_LIST_LOCK_TTL_MS = PUBLIC_LIST_POLICY.lockTtlMs;
/** Free-text values longer than this are near-unique per user: don't cache them. */
export const PUBLIC_LIST_MAX_CACHEABLE_TEXT = 24;

const DOMAIN_BY_NAMESPACE: Record<PublicListNamespace, Parameters<typeof getCacheDomain>[0]> = {
  stores: 'storeList',
  products: 'productList',
  'service-listings': 'serviceList',
  'service-providers': 'serviceProviderList',
};

const hardGenKey = (ns: PublicListNamespace): string => {
  const domain = getCacheDomain(DOMAIN_BY_NAMESPACE[ns]);
  return canonicalGenerationKey(domain.namespace, domain.scope as 'public', 'hard');
};
const softGenKey = (ns: PublicListNamespace): string => {
  const domain = getCacheDomain(DOMAIN_BY_NAMESPACE[ns]);
  return canonicalGenerationKey(domain.namespace, domain.scope as 'public', 'soft');
};

/** Long free-text values are near-unique per user: don't persist them in shared Redis. */
const isCacheableQuery = (query: unknown): boolean => {
  if (!query || typeof query !== 'object') return true;
  return Object.entries(query as Record<string, unknown>).every(([key, value]) => {
    if (typeof value !== 'string') return true;
    const freeText = key === 'q' || key === 'search';
    return !freeText || value.length <= PUBLIC_LIST_MAX_CACHEABLE_TEXT;
  });
};


export const publicListCacheKey = (ns: PublicListNamespace, query: unknown): string => {
  const domain = getCacheDomain(DOMAIN_BY_NAMESPACE[ns]);
  return canonicalCacheKey(domain.namespace, domain.scope as 'public', query);
};

export function cachedPublicList<T>(
  ns: PublicListNamespace,
  query: unknown,
  build: () => Promise<T>,
): Promise<T> {
  return swrGet<T>({
    name: `list:${ns}`,
    key: publicListCacheKey(ns, query),
    hardGenKey: hardGenKey(ns),
    softGenKey: softGenKey(ns),
    softTtlMs: () => PUBLIC_LIST_SOFT_TTL_MS + Math.floor(Math.random() * (PUBLIC_LIST_SOFT_JITTER_MS + 1)),
    hardTtlSec: PUBLIC_LIST_HARD_TTL_SECONDS,
    lockTtlMs: PUBLIC_LIST_LOCK_TTL_MS,
    build,
    cacheable: isCacheableQuery(query),
  });
}

/** SOFT invalidation for edits: stale served once, refreshed in the background. Never throws. */
export async function bumpPublicListCache(...namespaces: PublicListNamespace[]): Promise<void> {
  await Promise.all(namespaces.map(ns => bumpGeneration(softGenKey(ns))));
}

/**
 * For mutations that must HIDE an entity right now (delete, block, suspend,
 * status → not ACTIVE): invalidate the list namespace(s) AND the homepage,
 * which embeds these lists. Order matters — lists first, then home, because the
 * homepage rebuild reads through the list caches.
 */
export async function hidePublicEntities(...namespaces: PublicListNamespace[]): Promise<void> {
  await Promise.all(namespaces.map(ns => bumpGeneration(hardGenKey(ns))));
  await invalidateHomeCache();
}
