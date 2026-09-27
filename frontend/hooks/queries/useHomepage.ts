'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { homeApi } from '@/api/home.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import type { HomepagePayload } from '@/api/home.api';

/**
 * Fetches the aggregated GET /home payload once, then seeds the exact
 * same react-query cache entries FeaturedCarousel, CategoriesRow and
 * HomeAboveFold's useAds/useStores/useServiceListings/useCategories/
 * useProductCategories/useServiceCategories calls already read from —
 * so those components need no changes at all.
 *
 * Query-key params below must match each component's call EXACTLY
 * (queryKeys' hashing is structural, so key order doesn't matter, but
 * values do) — see FeaturedCarousel.tsx / CategoriesRow.tsx /
 * useAdsForHome.ts for the calls being mirrored.
 *
 * Two bugs fixed here after seeing this fire twice in production
 * (Network tab showed both `home` and `home?city=...` resolving, plus
 * every child section still firing its own request):
 *
 * 1. `city` comes from the auth store, which is NOT populated
 *    synchronously — it hydrates async (see the GET /me calls in the
 *    same trace). A first render with city:undefined produced query
 *    key home.page(undefined) and fired GET /home; once auth
 *    hydrated, city changed and home.page(city) fired a SECOND,
 *    different GET /home?city=... — two full aggregations instead of
 *    one. Fixed by gating on `isHydrated` so this only ever fires
 *    once, after the real city (if any) is already known.
 * 2. Seeding used to happen in a `useEffect` here, in the same
 *    component that conditionally renders the child sections
 *    (EagerHomeSections). React runs a commit's child effects before
 *    its parent's effects, so on the very render where the children
 *    first mounted, each child's own useQuery fired and checked the
 *    cache BEFORE this hook's effect had written to it — the cache
 *    was seeded one tick too late to matter. Fixed by seeding inside
 *    queryFn itself, so the cache is warm before `query.data` (and
 *    therefore the children) ever renders.
 */
export function useHomepage() {
  const queryClient = useQueryClient();
  const isHydrated = useAuthStore(selectIsHydrated);
  const city = useAuthStore((s) => s.user?.city ?? undefined);

  return useQuery({
    queryKey: queryKeys.home.page(city),
    enabled: isHydrated,
    queryFn: async (): Promise<HomepagePayload> => {
      const { featuredCarousel, categories, adsForHome } = await homeApi
        .getHomepage(city)
        .then((r) => r.data.data);

      // ── FeaturedCarousel ──
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

      // ── CategoriesRow ──
      queryClient.setQueryData(queryKeys.categories.all(), categories.ads);
      queryClient.setQueryData(queryKeys.productCategories.all(), categories.products);
      queryClient.setQueryData(queryKeys.serviceCategories.all(), categories.services);

      // ── HomeAboveFold (useAdsForHome) ──
      queryClient.setQueryData(
        queryKeys.ads.list({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' }),
        adsForHome.general,
      );
      if (adsForHome.city && city) {
        queryClient.setQueryData(
          queryKeys.ads.list({ city, limit: 6, sortBy: 'createdAt', sortOrder: 'desc' }),
          adsForHome.city,
        );
      }

      return { featuredCarousel, categories, adsForHome };
    },
    staleTime: CACHE_TTL.adsList,
  });
}
