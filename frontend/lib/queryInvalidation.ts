import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Invalidate only ad caches that can be affected by a write. The old
 * `ads.all()` also marks every unrelated ad detail stale. Related rails
 * are retained here because creating or editing an ad can change which
 * candidates appear in another ad's related results.
 */
export async function invalidateAdBrowseCaches(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.listRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.searchRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.infiniteRoot() }),
    // mineRoot() also prefixes myStats(), avoiding duplicate invalidation.
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.mineRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.relatedRoot() }),
    // /home embeds ad sections directly; refreshing only list keys leaves
    // the homepage payload (and useAdsForHome's seeded result) stale.
    queryClient.invalidateQueries({ queryKey: queryKeys.home.pageRoot() }),
  ]);
}

/** Invalidate browse caches plus the exact entity and related rails for an ad write. */
export async function invalidateAdEntityCaches(queryClient: QueryClient, adId: string): Promise<void> {
  await Promise.all([
    invalidateAdBrowseCaches(queryClient),
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.detail(adId) }),
  ]);
}

/**
 * Invalidate product collection caches without marking unrelated product
 * details or stock-history pages stale. Use `includeStock` for stock-changing
 * mutations; include `productId` when a known product was modified.
 */
export async function invalidateProductBrowseCaches(
  queryClient: QueryClient,
  options: { productId?: string; includeStock?: boolean; includeStockHistory?: boolean; includeAllDetails?: boolean } = {},
): Promise<void> {
  const jobs = [
    queryClient.invalidateQueries({ queryKey: queryKeys.products.listRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.products.infiniteRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.products.promotedRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.products.mineRoot() }),
    // /home contains recent/promoted product snapshots independent of list keys.
    queryClient.invalidateQueries({ queryKey: queryKeys.home.pageRoot() }),
  ];
  if (options.productId) jobs.push(queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(options.productId) }));
  if (options.includeAllDetails) jobs.push(queryClient.invalidateQueries({ queryKey: queryKeys.products.detailRoot() }));
  if (options.includeStock) jobs.push(queryClient.invalidateQueries({ queryKey: queryKeys.products.stockSummary() }));
  if (options.includeStockHistory) jobs.push(queryClient.invalidateQueries({ queryKey: queryKeys.products.stockHistoryRoot() }));
  await Promise.all(jobs);
}



/** Refresh store profile writes without invalidating unrelated store analytics,
 * membership, or follower-id caches. The homepage stores independent snapshots,
 * so it must be invalidated separately from browse/detail queries.
 */
export async function invalidateStoreProfileCaches(
  queryClient: QueryClient,
  storeId?: string,
): Promise<void> {
  const jobs = [
    queryClient.invalidateQueries({ queryKey: queryKeys.stores.listRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stores.infiniteRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stores.me() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.home.pageRoot() }),
  ];
  if (storeId) jobs.push(queryClient.invalidateQueries({ queryKey: queryKeys.stores.detail(storeId) }));
  await Promise.all(jobs);
}

/** Target service-listing collections and only the known detail when possible. */
export async function invalidateServiceListingCaches(
  queryClient: QueryClient,
  listingId?: string,
): Promise<void> {
  const jobs = [
    queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.listRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.infiniteRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.mineRoot() }),
    // Homepage embeds service-listing snapshots separately from browse lists.
    queryClient.invalidateQueries({ queryKey: queryKeys.home.pageRoot() }),
  ];
  if (listingId) jobs.push(queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.detail(listingId) }));
  await Promise.all(jobs);
}


/** Refresh customer collections and aggregate totals, with an exact detail when known. */
export async function invalidateCustomerCaches(
  queryClient: QueryClient,
  customerId?: string,
): Promise<void> {
  const jobs = [
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.listRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.searchRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.summary() }),
  ];
  if (customerId) jobs.push(queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customerId) }));
  await Promise.all(jobs);
}

/** Refresh request feeds and the known request detail, not every cached request detail. */
export async function invalidateRequestCaches(
  queryClient: QueryClient,
  requestId?: string,
): Promise<void> {
  const jobs = [
    queryClient.invalidateQueries({ queryKey: queryKeys.requests.openRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.requests.mineRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.requests.myOffersRoot() }),
  ];
  if (requestId) jobs.push(queryClient.invalidateQueries({ queryKey: queryKeys.requests.detail(requestId) }));
  await Promise.all(jobs);
}
