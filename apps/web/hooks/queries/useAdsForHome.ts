'use client';

import { useAds } from '@/hooks/queries/useAds';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { homeSectionLimit } from '@/lib/listLimits';
import { collectIds, dedupeKeepingMin } from '@/lib/homeDedupe';
import { useDataSaver } from '@/lib/useDataSaver';
import type { AdListItem } from '@/types/ad.types';
import type { HomepageLocationSource } from '@/api/home.api';

const HOME_LIMIT = 6;
const HOME_LIMIT_SAVER = 4;

export type AdsForHomeSource = HomepageLocationSource;

interface AdsForHomeResult {
  isChecking: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  source: AdsForHomeSource;
  radiusKm: number | null;
  items: { kind: 'ads'; data: AdListItem[] };
  refetch: () => void;
}

/**
 * أحدث الإعلانات — يفضّل adsForHome من GET /home (نسخة واحدة: مدينة أو عامة).
 */
export function useAdsForHome(): AdsForHomeResult {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(HOME_LIMIT, HOME_LIMIT_SAVER, dataSaver);
  const { city } = useBrowseCity();
  const hasCity = Boolean(city);
  const home = useHomepage();

  const seeded = home.data?.adsForHome ?? null;
  const hasSeed = seeded !== null && seeded !== undefined;
  const allowFetch = home.isError || (home.isSuccess && !hasSeed);

  const query = useAds(
    {
      ...(hasCity ? { city } : {}),
      limit,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    { enabled: allowFetch },
  );

  if (hasSeed) {
    // Featured ads already shown in the carousel are not repeated here.
    const carouselIds = collectIds(home.data?.featuredCarousel?.ads?.items);
    const seededItems = dedupeKeepingMin(seeded!.items as AdListItem[], carouselIds);
    return {
      isChecking: false,
      isLoading: false,
      isError: false,
      error: null,
      source: seeded!.source,
      radiusKm: null,
      items: { kind: 'ads', data: seededItems.slice(0, limit) },
      refetch: () => {
        void home.refetch();
      },
    };
  }

  return {
    isChecking: home.isPending,
    isLoading: home.isPending || query.isLoading,
    isError: !home.isPending && query.isError,
    error: query.error,
    source: hasCity ? 'city' : 'general',
    radiusKm: null,
    items: { kind: 'ads', data: query.data?.items ?? [] },
    refetch: () => {
      void home.refetch();
      void query.refetch();
    },
  };
}
