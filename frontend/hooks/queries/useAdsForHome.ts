'use client';

import { useAds } from '@/hooks/queries/useAds';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useHomepage } from '@/hooks/queries/useHomepage';
import type { AdListItem } from '@/types/ad.types';

const HOME_LIMIT = 6;

export type AdsForHomeSource = 'city' | 'general';

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
  const { city } = useBrowseCity();
  const hasCity = Boolean(city);
  const home = useHomepage();

  const seeded = home.data?.adsForHome ?? null;
  const hasSeed = Boolean(seeded?.items?.length);
  const allowFetch = home.isError || (home.isSuccess && !hasSeed);

  const query = useAds(
    {
      ...(hasCity ? { city } : {}),
      limit: HOME_LIMIT,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    { enabled: allowFetch },
  );

  if (hasSeed) {
    return {
      isChecking: false,
      isLoading: false,
      isError: false,
      error: null,
      source: hasCity ? 'city' : 'general',
      radiusKm: null,
      items: { kind: 'ads', data: seeded!.items as AdListItem[] },
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
