/**
 * Shared tag vocabulary for Next Data Cache and the backend's cache-purge
 * events. Keep route tags aligned with apps/api/src/shared/cache/publicMutationTags.ts.
 */
export const SERVER_CACHE_TAGS = {
  ads: 'route:ads',
  search: 'route:search',
  products: 'route:products',
  stores: 'route:stores',
  services: 'route:service-listings',
  serviceProviders: 'route:service-providers',
  categories: 'route:categories',
  productCategories: 'route:product-categories',
  serviceCategories: 'route:service-categories',
  serviceTypes: 'route:service-types',
  storeTypes: 'route:store-types',
  home: 'route:home',
} as const;

const PUBLIC_API_PATH_TAGS: ReadonlyArray<{
  matches: (pathname: string) => boolean;
  tags: readonly string[];
}> = [
  { matches: (path) => path === '/ads', tags: [SERVER_CACHE_TAGS.ads, SERVER_CACHE_TAGS.home] },
  { matches: (path) => path === '/ads/search', tags: [SERVER_CACHE_TAGS.ads, SERVER_CACHE_TAGS.search, SERVER_CACHE_TAGS.home] },
  { matches: (path) => path === '/products', tags: [SERVER_CACHE_TAGS.products, SERVER_CACHE_TAGS.home] },
  { matches: (path) => path === '/stores', tags: [SERVER_CACHE_TAGS.stores, SERVER_CACHE_TAGS.home] },
  { matches: (path) => path === '/service-listings', tags: [SERVER_CACHE_TAGS.services, SERVER_CACHE_TAGS.home] },
  { matches: (path) => path === '/categories', tags: [SERVER_CACHE_TAGS.categories] },
  { matches: (path) => path === '/product-categories', tags: [SERVER_CACHE_TAGS.productCategories, SERVER_CACHE_TAGS.products, SERVER_CACHE_TAGS.ads, SERVER_CACHE_TAGS.home] },
  { matches: (path) => path === '/service-categories', tags: [SERVER_CACHE_TAGS.serviceCategories, SERVER_CACHE_TAGS.services, SERVER_CACHE_TAGS.home] },
  { matches: (path) => path === '/service-types', tags: [SERVER_CACHE_TAGS.serviceTypes, SERVER_CACHE_TAGS.services, SERVER_CACHE_TAGS.home] },
  { matches: (path) => path === '/store-types', tags: [SERVER_CACHE_TAGS.storeTypes, SERVER_CACHE_TAGS.stores, SERVER_CACHE_TAGS.home] },
  { matches: (path) => path === '/home' || path === '/home/static', tags: [SERVER_CACHE_TAGS.home] },
];

/** Resolve cache tags only for explicitly public, viewer-independent GET paths. */
export function getPublicApiCacheTags(path: string): readonly string[] {
  const pathname = new URL(path, 'https://marketplat-internal.invalid').pathname.replace(/\/$/, '') || '/';
  const matched = PUBLIC_API_PATH_TAGS.find((entry) => entry.matches(pathname));
  if (!matched) {
    throw new Error(`No public Next cache policy is registered for API path: ${pathname}`);
  }
  return [...matched.tags, 'api'];
}

/** Entity tags are used by detail reads that are safe to cache in a later phase. */
export const entityCacheTag = {
  ad: (id: string) => `ad:${id}`,
  product: (id: string) => `product:${id}`,
  store: (id: string) => `store:${id}`,
  service: (id: string) => `service:${id}`,
  category: (id: string) => `category:${id}`,
} as const;
