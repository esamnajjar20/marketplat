'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { homeApi } from '@/api/home.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import type { HomepagePayload } from '@/api/home.api';
import type { PaginationMeta } from '@/types/api.types';
import type { AdSearchParams } from '@/types/ad.types';
import type { ProductsQuery } from '@/types/product.types';
import type { StoresQuery } from '@/types/store.types';
import type { ServiceListingsQuery } from '@/types/service.types';

type PageLike<T> = { items: T[]; meta: PaginationMeta };

/**
 * Seed the exact list query key used by each homepage section.
 * Data-saver sections slice the seeded items locally, so a second
 * shorter-limit cache entry is unnecessary.
 */
function seedListPage<T, P extends object>(
  queryClient: ReturnType<typeof useQueryClient>,
  keyFactory: (params: P) => readonly unknown[],
  baseParams: P,
  page: PageLike<T> | null | undefined,
) {
  if (!page) return;
  queryClient.setQueryData(keyFactory(baseParams), page);
}

/** Payloads whose section caches were already seeded (queryFn or hydration). */
const seededPayloads = new WeakSet<HomepagePayload>();

/**
 * Seed the per-section list caches from one /home payload. Null sections
 * (failed on the server) are skipped so their own hooks fetch them.
 */
function seedHomeCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  payload: HomepagePayload,
  city: string | undefined,
) {
  if (seededPayloads.has(payload)) return;
  seededPayloads.add(payload);

  const { featuredCarousel, categories, adsForHome, belowFold, guestTrending } = payload;

  // Guest "الأكثر رواجًا": ForYouMixedSection asks for 3 per type with the
  // 'guest' scope. The server already applied the city (with its own general
  // backfill), so it is safe to seed under the requested city's key. Signed-in
  // users read the 'user' scope and are unaffected.
  if (guestTrending) {
    const params = { limit: 3, ...(city ? { city } : {}) };
    if (guestTrending.ads) {
      queryClient.setQueryData(queryKeys.recommendations.list(params, 'guest'), guestTrending.ads);
    }
    if (guestTrending.products) {
      queryClient.setQueryData(queryKeys.recommendations.products(params, 'guest'), guestTrending.products);
    }
    if (guestTrending.services) {
      queryClient.setQueryData(queryKeys.recommendations.services(params, 'guest'), guestTrending.services);
    }
  }

  if (featuredCarousel.ads) {
    queryClient.setQueryData(
      queryKeys.ads.list({ isFeatured: true, limit: 2 }),
      featuredCarousel.ads,
    );
  }

  if (categories.ads) queryClient.setQueryData(queryKeys.categories.all(), categories.ads);
  if (categories.products) {
    queryClient.setQueryData(queryKeys.productCategories.all(), categories.products);
  }
  if (categories.services) {
    queryClient.setQueryData(queryKeys.serviceCategories.all(), categories.services);
  }

  // A general fallback must never be seeded into a city-specific
  // query key. The homepage sections read belowFold directly, so
  // fallback data remains visible without contaminating browse caches.
  const canSeedLocationResult = (source: 'city' | 'general') =>
    !city || source === 'city';

  if (adsForHome && canSeedLocationResult(adsForHome.source)) {
    const adsBase: AdSearchParams = {
      limit: 6, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}),
    };
    seedListPage(queryClient, (p) => queryKeys.ads.list(p), adsBase, adsForHome);
  }

  if (!belowFold) return;

  const productBase: ProductsQuery = {
    limit: 8,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
    ...(city ? { city } : {}),
  };

  if (belowFold.recentProducts && canSeedLocationResult(belowFold.recentProducts.source)) {
    seedListPage(queryClient, (p) => queryKeys.products.list(p), productBase, belowFold.recentProducts);
  }

  // Promotions are global (no city in key).
  const promotedProductsBase: ProductsQuery = { limit: 8, sortBy: 'createdAt', sortOrder: 'desc', hasPromotion: true };
  seedListPage(queryClient, (p) => queryKeys.products.list(p), promotedProductsBase, belowFold.promotedProducts);

  if (belowFold.homeServices && canSeedLocationResult(belowFold.homeServices.source)) {
    const servicesBase: ServiceListingsQuery = {
      limit: 8, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}),
    };
    seedListPage(queryClient, (p) => queryKeys.serviceListings.list(p), servicesBase, belowFold.homeServices);
  }

  if (belowFold.featuredStores && canSeedLocationResult(belowFold.featuredStores.source)) {
    const storesBase: StoresQuery = { limit: 6, ...(city ? { city } : {}) };
    seedListPage(queryClient, (p) => queryKeys.stores.list(p), storesBase, belowFold.featuredStores);
  }

  if (belowFold.nearbyProviders && canSeedLocationResult(belowFold.nearbyProviders.source)) {
    seedListPage(
      queryClient,
      (p) => queryKeys.serviceProviders.list(p),
      { limit: 6, ...(city ? { city } : {}) },
      belowFold.nearbyProviders,
    );
  }
}

/**
 * One GET /home → seeds every public homepage section cache key.
 * Payload is single-variant (city OR general), no dual lists.
 *
 * - The guest/no-city payload is prefetched on the server (see
 *   app/(public)/page.tsx) and arrives through <HydrationBoundary>; the
 *   effect below then seeds the section caches, since queryFn never ran
 *   on the client in that case.
 * - `placeholderData` keeps the current sections on
 *   screen while a different city loads, instead of collapsing the whole
 *   page back to skeletons on every city change.
 */
export function useHomepage() {
  const queryClient = useQueryClient();
  const isHydrated = useAuthStore(selectIsHydrated);
  const { city, isReady } = useBrowseCity();

  const query = useQuery({
    queryKey: queryKeys.home.page(city),
    enabled: isHydrated && isReady,
    queryFn: async (): Promise<HomepagePayload> => {
      const payload = await homeApi.getHomepage(city).then((r) => r.data.data);
      if (!payload) {
        throw new Error('empty /home response');
      }
      seedHomeCaches(queryClient, payload, city);
      return payload;
    },
    // Keep the previous payload on screen while a new city loads. On first
    // load with a city (signed-in user with a profile city) there is no
    // previous payload, so fall back to the server-prefetched general one —
    // HomeBusyBoundary dims it — instead of collapsing to a full skeleton.
    placeholderData: (previous) =>
      previous ?? queryClient.getQueryData<HomepagePayload>(queryKeys.home.page(undefined)),
    staleTime: CACHE_TTL.adsList,
    // No `refetchOnMount` override: the QueryClient default refetches on
    // mount only when the data is older than staleTime (90s). The previous
    // `false` pinned stale data (sold/deleted ads) until gcTime (10 min).
    refetchOnWindowFocus: false,
  });

  const { data, isPlaceholderData } = query;
  useEffect(() => {
    // Never seed from placeholder (previous city) data.
    if (data && !isPlaceholderData) seedHomeCaches(queryClient, data, city);
  }, [data, isPlaceholderData, city, queryClient]);

  return query;
}
