'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { homeApi } from '@/api/home.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import type { HomepagePayload } from '@/api/home.api';
import type { PaginationMeta } from '@/types/api.types';

type PageLike<T> = { items: T[]; meta: PaginationMeta };

/**
 * Seed a list query key and (when useful) the data-saver shorter-limit
 * key so homeSectionLimit(8→4 / 6→4) still hits cache.
 */
function seedListPage<T>(
  queryClient: ReturnType<typeof useQueryClient>,
  keyFactory: (params: Record<string, unknown>) => readonly unknown[],
  baseParams: Record<string, unknown>,
  page: PageLike<T> | null | undefined,
  saverLimit?: number,
) {
  if (!page) return;
  queryClient.setQueryData(keyFactory(baseParams), page);
  const fullLimit = typeof baseParams.limit === 'number' ? baseParams.limit : undefined;
  if (saverLimit != null && fullLimit != null && saverLimit < fullLimit && page.items.length) {
    queryClient.setQueryData(keyFactory({ ...baseParams, limit: saverLimit }), {
      items: page.items.slice(0, saverLimit),
      meta: {
        ...page.meta,
        limit: saverLimit,
        total: Math.min(page.meta.total, page.items.slice(0, saverLimit).length),
      },
    });
  }
}

/**
 * One GET /home → seeds every public homepage section cache key.
 * Payload is single-variant (city OR general), no dual lists.
 */
export function useHomepage() {
  const queryClient = useQueryClient();
  const isHydrated = useAuthStore(selectIsHydrated);
  const { city, isReady } = useBrowseCity();

  return useQuery({
    queryKey: queryKeys.home.page(city),
    enabled: isHydrated && isReady,
    queryFn: async (): Promise<HomepagePayload> => {
      const payload = await homeApi.getHomepage(city).then((r) => r.data.data);
      if (!payload) {
        throw new Error('empty /home response');
      }
      const { featuredCarousel, categories, adsForHome, belowFold } = payload;

      queryClient.setQueryData(
        queryKeys.ads.list({ isFeatured: true, limit: 2 }),
        featuredCarousel.ads,
      );
      if (featuredCarousel.adsFallback) {
        queryClient.setQueryData(
          queryKeys.ads.list({ limit: 2, sortBy: 'createdAt', sortOrder: 'desc' }),
          featuredCarousel.adsFallback,
        );
      }
      queryClient.setQueryData(queryKeys.stores.list({ limit: 2 }), featuredCarousel.stores);
      queryClient.setQueryData(
        queryKeys.serviceListings.list({ sortBy: 'views', limit: 2 }),
        featuredCarousel.services,
      );

      queryClient.setQueryData(queryKeys.categories.all(), categories.ads);
      queryClient.setQueryData(queryKeys.productCategories.all(), categories.products);
      queryClient.setQueryData(queryKeys.serviceCategories.all(), categories.services);

      // Seed the exact key the section hooks use (with city when present)
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

      if (belowFold) {
        const productBase = {
          limit: 8,
          sortBy: 'createdAt' as const,
          sortOrder: 'desc' as const,
          ...(city ? { city } : {}),
        };

        seedListPage(
          queryClient,
          (p) => queryKeys.products.list(p),
          productBase,
          belowFold.recentProducts,
          4,
        );
        // Promotions are global (no city in key)
        seedListPage(
          queryClient,
          (p) => queryKeys.products.list(p),
          { limit: 8, sortBy: 'createdAt', sortOrder: 'desc', hasPromotion: true },
          belowFold.promotedProducts,
          4,
        );
        seedListPage(
          queryClient,
          (p) => queryKeys.serviceListings.list(p),
          {
            limit: 8,
            sortBy: 'createdAt',
            sortOrder: 'desc',
            ...(city ? { city } : {}),
          },
          belowFold.homeServices,
          4,
        );
        seedListPage(
          queryClient,
          (p) => queryKeys.stores.list(p),
          { limit: 6, ...(city ? { city } : {}) },
          belowFold.featuredStores,
          4,
        );
        seedListPage(
          queryClient,
          (p) => queryKeys.serviceProviders.list(p),
          { limit: 6, ...(city ? { city } : {}) },
          belowFold.nearbyProviders,
        );
      }

      return payload;
    },
    staleTime: CACHE_TTL.adsList,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
