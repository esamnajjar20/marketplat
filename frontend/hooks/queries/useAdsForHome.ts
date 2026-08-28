'use client';

import { useAds } from '@/hooks/queries/useAds';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { useSequentialGeoSearch } from '@/hooks/queries/useSequentialGeoSearch';
import type { AdListItem } from '@/types/ad.types';
import type { SearchResult } from '@/types/search.types';

const HOME_LIMIT = 6;

export type AdsForHomeSource = 'gps' | 'city' | 'general';

interface AdsForHomeResult {
  isChecking: boolean;
  isLoading: boolean;
  isError: boolean;
  source: AdsForHomeSource;
  radiusKm: number | null;
  items: { kind: 'search'; data: SearchResult[] } | { kind: 'ads'; data: AdListItem[] };
  refetch: () => void;
}

/**
 * أحدث الإعلانات — GPS بتوسيع متسلسل 1→5→10→25→100 ثم القائمة العامة.
 */
export function useAdsForHome(): AdsForHomeResult {
  const location = useLocationResolver();

  const isGps = location.source === 'gps-current' || location.source === 'gps-saved';
  const isCity = location.source === 'city';

  const geo = useSequentialGeoSearch({
    enabled: isGps,
    lat: location.latitude,
    lng: location.longitude,
    type: 'ads',
    limit: HOME_LIMIT,
  });

  const cityQuery = useAds(
    {
      city: isCity ? location.city : undefined,
      limit: HOME_LIMIT,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    { enabled: isCity },
  );

  const generalQuery = useAds({
    limit: HOME_LIMIT,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const isChecking = location.isLoading;
  const generalItems = generalQuery.data?.items ?? [];
  const generalResult: AdsForHomeResult = {
    isChecking,
    isLoading: generalQuery.isLoading,
    isError: generalQuery.isError,
    source: 'general',
    radiusKm: null,
    items: { kind: 'ads', data: generalItems },
    refetch: () => {
      generalQuery.refetch();
    },
  };

  if (isGps) {
    if (!geo.settled || geo.isLoading) {
      return {
        isChecking,
        isLoading: true,
        isError: false,
        source: 'gps',
        radiusKm: null,
        items: { kind: 'search', data: [] },
        refetch: geo.refetch,
      };
    }
    if (!geo.isError && geo.items.length > 0) {
      return {
        isChecking,
        isLoading: false,
        isError: false,
        source: 'gps',
        radiusKm: geo.radiusKm,
        items: { kind: 'search', data: geo.items },
        refetch: geo.refetch,
      };
    }
    return generalResult;
  }

  if (isCity) {
    if (cityQuery.isLoading) {
      return {
        isChecking,
        isLoading: true,
        isError: false,
        source: 'city',
        radiusKm: null,
        items: { kind: 'ads', data: [] },
        refetch: () => {
          cityQuery.refetch();
        },
      };
    }
    const cityItems = cityQuery.data?.items ?? [];
    if (!cityQuery.isError && cityItems.length > 0) {
      return {
        isChecking,
        isLoading: false,
        isError: false,
        source: 'city',
        radiusKm: null,
        items: { kind: 'ads', data: cityItems },
        refetch: () => {
          cityQuery.refetch();
        },
      };
    }
    return generalResult;
  }

  return generalResult;
}
