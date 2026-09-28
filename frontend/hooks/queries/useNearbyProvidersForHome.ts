'use client';

import { useServiceProviders } from '@/hooks/queries/useServiceProviders';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { homeSectionLimit } from '@/lib/listLimits';
import { useDataSaver } from '@/lib/useDataSaver';



export type NearbyProvidersForHomeSource = 'city' | 'general';

/**
 * مقدمو خدمات — يفضّل belowFold.nearbyProviders من GET /home (نسخة واحدة).
 */
export function useNearbyProvidersForHome() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(6, 4, dataSaver);
  const { city } = useBrowseCity();
  const home = useHomepage();
  const seeded = home.data?.belowFold?.nearbyProviders ?? null;
  const hasSeed = seeded !== null && seeded !== undefined;
  const allowFetch = home.isError || (home.isSuccess && !hasSeed);

  const query = useServiceProviders(
    {
      limit,
      ...(city ? { city } : {}),
    },
    { enabled: allowFetch },
  );

  if (hasSeed) {
    return {
      isChecking: false,
      data: seeded!,
      isLoading: false,
      isError: false,
      source: (city ? 'city' : 'general') as NearbyProvidersForHomeSource,
      radiusKm: null as number | null,
      refetch: () => {
        void home.refetch();
      },
    };
  }

  return {
    isChecking: home.isPending,
    data: query.data,
    isLoading: home.isPending || query.isLoading,
    isError: !home.isPending && query.isError,
    source: (city ? 'city' : 'general') as NearbyProvidersForHomeSource,
    radiusKm: null as number | null,
    refetch: () => {
      void home.refetch();
      void query.refetch();
    },
  };
}
