'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServiceProviders } from '@/hooks/queries/useServiceProviders';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  PROGRESSIVE_RADIUS_KM,
  MIN_RESULTS_ACCEPT,
} from '@/lib/progressiveRadius';

const HOME_LIMIT = 6;

export type NearbyProvidersForHomeSource = 'gps' | 'city' | 'general';

/**
 * مقدمو خدمات — توسيع متسلسل لنصف القطر ثم الدليل العام.
 */
export function useNearbyProvidersForHome() {
  const location = useLocationResolver();

  const isGps = location.source === 'gps-current' || location.source === 'gps-saved';
  const isCity = location.source === 'city';
  const lat = location.latitude;
  const lng = location.longitude;

  // FIX NEARBY-HOME-STEP-RESET-RACE: same bug as
  // useSequentialGeoSearch's GEOSEQ-STEP-RESET-RACE — see that
  // hook's comment for the full analysis. The previous useEffect
  // resetting step on [lat, lng, isGps] change raced with the probe
  // effect below on cache-warm input changes, causing the 1km
  // radius to be skipped and expansion to start from 5km. React's
  // documented render-time reset pattern replaces it.
  const [step, setStep] = useState(0);
  const prevInputsRef = useRef({ lat, lng, isGps });
  if (
    prevInputsRef.current.lat !== lat ||
    prevInputsRef.current.lng !== lng ||
    prevInputsRef.current.isGps !== isGps
  ) {
    prevInputsRef.current = { lat, lng, isGps };
    setStep(0);
  }

  const radius = PROGRESSIVE_RADIUS_KM[Math.min(step, PROGRESSIVE_RADIUS_KM.length - 1)]!;

  const nearbyQuery = useQuery({
    queryKey: queryKeys.serviceProviders.nearby({
      lat: lat ?? 0,
      lng: lng ?? 0,
      radius,
      limit: HOME_LIMIT,
    }),
    queryFn: () =>
      serviceProvidersApi
        .getNearby({ lat: lat!, lng: lng!, radius, limit: HOME_LIMIT })
        .then((r) => r.data.data),
    enabled: Boolean(isGps && lat != null && lng != null),
    staleTime: CACHE_TTL.adsList,
  });

  const count = nearbyQuery.data?.items?.length ?? 0;
  const hasEnough = count >= MIN_RESULTS_ACCEPT;
  const isLast = step >= PROGRESSIVE_RADIUS_KM.length - 1;

  useEffect(() => {
    if (!isGps || nearbyQuery.isLoading || nearbyQuery.isFetching || nearbyQuery.isError) return;
    if (hasEnough || isLast) return;
    setStep((s) => Math.min(s + 1, PROGRESSIVE_RADIUS_KM.length - 1));
  }, [isGps, nearbyQuery.isLoading, nearbyQuery.isFetching, nearbyQuery.isError, hasEnough, isLast, count, step]);

  const cityQuery = useServiceProviders(
    isCity ? { city: location.city, limit: HOME_LIMIT } : undefined,
    { enabled: isCity },
  );

  const generalQuery = useServiceProviders({ limit: HOME_LIMIT });

  const isChecking = location.isLoading;

  return useMemo(() => {
    const generalResult = {
      isChecking,
      source: 'general' as NearbyProvidersForHomeSource,
      data: generalQuery.data,
      isLoading: generalQuery.isLoading,
      isError: generalQuery.isError,
      radiusKm: null as number | null,
    };

    if (isGps) {
      const settled =
        !nearbyQuery.isLoading &&
        !nearbyQuery.isFetching &&
        (hasEnough || isLast || nearbyQuery.isError);
      if (!settled) {
        return {
          isChecking,
          source: 'gps' as NearbyProvidersForHomeSource,
          data: undefined,
          isLoading: true,
          isError: false,
          radiusKm: null as number | null,
        };
      }
      if (!nearbyQuery.isError && count > 0) {
        return {
          isChecking,
          source: 'gps' as NearbyProvidersForHomeSource,
          data: nearbyQuery.data,
          isLoading: false,
          isError: false,
          radiusKm: radius,
        };
      }
      return generalResult;
    }

    if (isCity) {
      if (cityQuery.isLoading) {
        return {
          isChecking,
          source: 'city' as NearbyProvidersForHomeSource,
          data: undefined,
          isLoading: true,
          isError: false,
          radiusKm: null as number | null,
        };
      }
      const cityItems = cityQuery.data?.items ?? [];
      if (!cityQuery.isError && cityItems.length > 0) {
        return {
          isChecking,
          source: 'city' as NearbyProvidersForHomeSource,
          data: cityQuery.data,
          isLoading: false,
          isError: false,
          radiusKm: null as number | null,
        };
      }
      return generalResult;
    }

    return generalResult;
  }, [
    isChecking,
    isGps,
    isCity,
    nearbyQuery,
    cityQuery,
    generalQuery,
    hasEnough,
    isLast,
    count,
    radius,
  ]);
}
