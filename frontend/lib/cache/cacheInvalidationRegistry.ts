import contract from './cache-contract.json';

export type OfflineCacheSlot =
  | 'ads' | 'products' | 'services' | 'stores' | 'categories'
  | 'productCategories' | 'serviceCategories' | 'activity' | 'savedSearches'
  | 'myAds' | 'appointments' | 'profile' | 'seller' | 'storeSelf'
  | 'providerSelf' | 'notifications' | 'conversations' | 'messages';

export type CacheDomain = keyof typeof contract.domains;

export type CacheInvalidationRule = {
  prefixes: readonly string[];
  domains: readonly CacheDomain[];
  local: readonly OfflineCacheSlot[];
};

/** Generated from the shared cache contract. Do not define mutation coverage ad hoc in components. */
export const CACHE_INVALIDATION_REGISTRY = contract.invalidation as readonly CacheInvalidationRule[];

export function getCacheInvalidationRule(pathname: string): CacheInvalidationRule | null {
  return CACHE_INVALIDATION_REGISTRY.find((rule) =>
    rule.prefixes.some((prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`),
    ),
  ) ?? null;
}
