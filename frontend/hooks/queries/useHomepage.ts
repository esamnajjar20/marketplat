'use client';

import { useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { homeApi } from '@/api/home.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import type { HomepagePayload } from '@/api/home.api';
import type { PaginationMeta } from '@/types/api.types';

type PageLike<T> = { items: T[]; meta: PaginationMeta };

/**
 * Seed the exact list query key used by each homepage section.
 * Data-saver sections slice the seeded items locally, so a second
 * shorter-limit cache entry is unnecessary.
 */
function seedListPage<T>(
  queryClient: ReturnType<typeof useQueryClient>,
  keyFactory: (params: Record<string, unknown>) => readonly unknown[],
  baseParams: Record<string, unknown>,
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

  const { featuredCarousel, categories, adsForHome, belowFold } = payload;

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
    seedListPage(
      queryClient,
      (p) => queryKeys.ads.list(p),
      {
        limit: 6,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        ...(city ? { city } : {}),
      },
      adsForHome,
    );
  }

  if (!belowFold) return;

  const productBase = {
    limit: 8,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
    ...(city ? { city } : {}),
  };

  if (belowFold.recentProducts && canSeedLocationResult(belowFold.recentProducts.source)) {
    seedListPage(queryClient, (p) => queryKeys.products.list(p), productBase, belowFold.recentProducts);
  }

  // Promotions are global (no city in key).
  seedListPage(
    queryClient,
    (p) => queryKeys.products.list(p),
    { limit: 8, sortBy: 'createdAt', sortOrder: 'desc', hasPromotion: true },
    belowFold.promotedProducts,
  );

  if (belowFold.homeServices && canSeedLocationResult(belowFold.homeServices.source)) {
    seedListPage(
      queryClient,
      (p) => queryKeys.serviceListings.list(p),
      { limit: 8, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) },
      belowFold.homeServices,
    );
  }

  if (belowFold.featuredStores && canSeedLocationResult(belowFold.featuredStores.source)) {
    seedListPage(
      queryClient,
      (p) => queryKeys.stores.list(p),
      { limit: 6, ...(city ? { city } : {}) },
      belowFold.featuredStores,
    );
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
 * - `placeholderData: keepPreviousData` keeps the current sections on
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
    placeholderData: keepPreviousData,
    staleTime: CACHE_TTL.adsList,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data, isPlaceholderData } = query;
  useEffect(() => {
    // Never seed from placeholder (previous city) data.
    if (data && !isPlaceholderData) seedHomeCaches(queryClient, data, city);
  }, [data, isPlaceholderData, city, queryClient]);

  return query;
}
