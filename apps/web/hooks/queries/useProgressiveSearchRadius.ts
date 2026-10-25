'use client';

import { useSequentialGeoSearch } from '@/hooks/queries/useSequentialGeoSearch';
import type { SearchType, SearchSort } from '@/types/search.types';

interface Args {
  enabled: boolean;
  lat?: number;
  lng?: number;
  explicitRadius?: number;
  type?: SearchType;
  q?: string;
  city?: string;
  categoryId?: string;
  sort?: SearchSort;
  limit?: number;
}

/**
 * غلاف متوافق مع SearchResults — توسيع متسلسل تحت الغطاء.
 * مع مدينة صريحة أو radius يدوي: لا probing.
 */
export function useProgressiveSearchRadius(args: Args): {
  isLoading: boolean;
  radiusKm: number | null;
  resolved: boolean;
} {
  const {
    enabled,
    lat,
    lng,
    explicitRadius,
    type = 'all',
    q,
    city,
    categoryId,
    limit = 8,
  } = args;

  const hasExplicitRadius =
    explicitRadius !== undefined && !Number.isNaN(explicitRadius);

  const shouldProbe = Boolean(
    !hasExplicitRadius &&
      enabled &&
      lat != null &&
      lng != null &&
      !city,
  );

  const geo = useSequentialGeoSearch({
    enabled: shouldProbe,
    lat,
    lng,
    type,
    q,
    categoryId,
    limit,
  });

  if (hasExplicitRadius) {
    return {
      isLoading: false,
      radiusKm: explicitRadius,
      resolved: true,
    };
  }

  if (!shouldProbe) {
    return {
      isLoading: false,
      radiusKm: null,
      resolved: true,
    };
  }

  return {
    isLoading: !geo.settled || geo.isLoading,
    radiusKm: geo.settled ? geo.radiusKm ?? 100 : null,
    resolved: geo.settled,
  };
}
