import { createHash } from 'crypto';
import { swrGet, bumpGeneration } from './swrCache';
import { invalidateHomeCache } from '../../modules/home/home.cache.keys';

/**
 * FIX PUBLIC-LIST-CACHE-01: Redis SWR cache for the public browse lists of
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

export const PUBLIC_LIST_SOFT_TTL_MS = 20_000;
export const PUBLIC_LIST_SOFT_JITTER_MS = 5_000;
export const PUBLIC_LIST_HARD_TTL_SECONDS = 90;
export const PUBLIC_LIST_LOCK_TTL_MS = 10_000;
/** Free-text values longer than this are near-unique per user: don't cache them. */
export const PUBLIC_LIST_MAX_CACHEABLE_TEXT = 24;

const hardGenKey = (ns: PublicListNamespace): string => `plist:gen:hard:${ns}`;
const softGenKey = (ns: PublicListNamespace): string => `plist:gen:soft:${ns}`;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/** Long free-text (search) queries are served from the DB, still singleflighted. */
const isCacheableQuery = (query: unknown): boolean => {
  if (!query || typeof query !== 'object') return true;
  return Object.entries(query as Record<string, unknown>).every(([k, v]) => {
    if (typeof v !== 'string') return true;
    const freeText = k === 'q' || k === 'search';
    return !freeText || v.length <= PUBLIC_LIST_MAX_CACHEABLE_TEXT;
  });
};

export const publicListCacheKey = (ns: PublicListNamespace, query: unknown): string => {
  const body = stableStringify(query);
  // Bound the key length (long filters would otherwise make multi-KB keys).
  const digest = body.length > 120 ? createHash('sha1').update(body).digest('hex') : body;
  return `plist:v1:${ns}:${digest}`;
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
