'use client';

import { useEffect, useState } from 'react';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { useNearbyServiceProviders, useServiceProviders } from '@/hooks/queries/useServiceProviders';

export const SERVICE_PROVIDERS_DIRECTORY_RADIUS_KM = 10;
export const SERVICE_PROVIDERS_DIRECTORY_PAGE_LIMIT = 12;

export type ServiceProvidersDirectorySource = 'gps' | 'city' | 'general';

type ResolverBucket = 'gps' | 'city' | 'general';

/**
 * FIX BUG-04 / ARCH-FIX (audit: "/service-providers صفحة مختلفة جذريًا
 * عن الرئيسية"): the standalone /service-providers page used to be
 * fully GPS-gated (useNearbyServiceProviders only, no fallback) —
 * denying location, or a browser with no geolocation support, was a
 * dead end here, even though Home's own "مقدمو خدمات قريبون منك"
 * section (useNearbyProvidersForHome) already had a full
 * gps → city → general cascade via useLocationResolver, backed by an
 * endpoint (GET /service-providers?city=) that already existed and
 * was already wired up everywhere else.
 *
 * This hook applies the same cascade to the standalone directory page,
 * with real pagination layered on top (Home's version is a fixed
 * 6-item teaser with no pager). The cascade decision is made ONCE per
 * resolved location source, from that source's page-1 result only —
 * not re-evaluated on every page change. Without that, paging forward
 * into a legitimately-empty later page of a *working* gps/city result
 * set would look identical to "this source has nothing at all" and
 * incorrectly bounce the user over to the general directory mid-browse.
 * Once a source is confirmed viable from its first page, further
 * pages/errors on that same source are shown as normal
 * pagination/error states instead of triggering another cascade.
 *
 * Decision resets to a fresh probe (and page resets to 1) whenever the
 * resolver itself reports a different location source — e.g. a GPS
 * fix arriving after the page settled on the city or general result.
 */
export function useServiceProvidersDirectory() {
  const location = useLocationResolver();
  const [page, setPage] = useState(1);
  const [decidedSource, setDecidedSource] = useState<ServiceProvidersDirectorySource | null>(null);

  const isGps = location.source === 'gps-current' || location.source === 'gps-saved';
  const isCity = location.source === 'city';
  const resolverBucket: ResolverBucket = isGps ? 'gps' : isCity ? 'city' : 'general';

  const [trackedBucket, setTrackedBucket] = useState<ResolverBucket>(resolverBucket);
  useEffect(() => {
    if (resolverBucket !== trackedBucket) {
      setTrackedBucket(resolverBucket);
      setDecidedSource(null);
      setPage(1);
    }
  }, [resolverBucket, trackedBucket]);

  // While undecided, always probe page 1 regardless of live `page`
  // state (page can only be >1 once a source has already been decided).
  const probing = decidedSource === null && resolverBucket !== 'general';

  const nearbyParams =
    resolverBucket === 'gps' && (probing || decidedSource === 'gps')
      ? {
          lat: location.latitude!,
          lng: location.longitude!,
          radius: SERVICE_PROVIDERS_DIRECTORY_RADIUS_KM,
          page: probing ? 1 : page,
          limit: SERVICE_PROVIDERS_DIRECTORY_PAGE_LIMIT,
        }
      : null;
  const nearbyQuery = useNearbyServiceProviders(nearbyParams);

  const cityEnabled = resolverBucket === 'city' && (probing || decidedSource === 'city');
  const cityQuery = useServiceProviders(
    cityEnabled
      ? { city: location.city, page: probing ? 1 : page, limit: SERVICE_PROVIDERS_DIRECTORY_PAGE_LIMIT }
      : undefined,
    { enabled: cityEnabled },
  );

  const generalEnabled = resolverBucket === 'general' || decidedSource === 'general';
  const generalQuery = useServiceProviders(
    generalEnabled ? { page, limit: SERVICE_PROVIDERS_DIRECTORY_PAGE_LIMIT } : undefined,
    { enabled: generalEnabled },
  );

  // ── Resolve the probe into a one-time decision ─────────────────────
  useEffect(() => {
    if (!probing) return;
    if (resolverBucket === 'gps' && !nearbyQuery.isLoading) {
      const items = nearbyQuery.data?.items ?? [];
      setDecidedSource(!nearbyQuery.isError && items.length > 0 ? 'gps' : 'general');
    }
    if (resolverBucket === 'city' && !cityQuery.isLoading) {
      const items = cityQuery.data?.items ?? [];
      setDecidedSource(!cityQuery.isError && items.length > 0 ? 'city' : 'general');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    probing,
    resolverBucket,
    nearbyQuery.isLoading,
    nearbyQuery.isError,
    nearbyQuery.data,
    cityQuery.isLoading,
    cityQuery.isError,
    cityQuery.data,
  ]);

  const effectiveSource: ServiceProvidersDirectorySource =
    resolverBucket === 'general' ? 'general' : (decidedSource ?? resolverBucket);

  const isChecking = location.isLoading || probing;

  if (effectiveSource === 'gps') {
    return {
      isChecking,
      source: 'gps' as const,
      data: nearbyQuery.data,
      isLoading: nearbyQuery.isLoading,
      isError: nearbyQuery.isError,
      refetch: nearbyQuery.refetch,
      page,
      setPage,
      city: undefined as string | undefined,
      requestLocation: location.requestLocation,
    };
  }

  if (effectiveSource === 'city') {
    return {
      isChecking,
      source: 'city' as const,
      data: cityQuery.data,
      isLoading: cityQuery.isLoading,
      isError: cityQuery.isError,
      refetch: cityQuery.refetch,
      page,
      setPage,
      city: location.city,
      requestLocation: location.requestLocation,
    };
  }

  return {
    isChecking,
    source: 'general' as const,
    data: generalQuery.data,
    isLoading: generalQuery.isLoading,
    isError: generalQuery.isError,
    refetch: generalQuery.refetch,
    page,
    setPage,
    city: undefined as string | undefined,
    requestLocation: location.requestLocation,
  };
}
