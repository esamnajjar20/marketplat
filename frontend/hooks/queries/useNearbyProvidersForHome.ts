'use client';

import { useLocationResolver } from '@/hooks/useLocationResolver';
import { useNearbyServiceProviders, useServiceProviders } from '@/hooks/queries/useServiceProviders';

const RADIUS_KM = 10;
const HOME_LIMIT = 6;

export type NearbyProvidersForHomeSource = 'gps' | 'city' | 'general';

/**
 * Phase 4: "مقدمو خدمات قريبون منك" data source for Home, now driven
 * by useLocationResolver's full priority chain instead of a GPS-only
 * permission check (see git history for the prior gps-current-only
 * version of this hook, which this replaces).
 *
 *   - gps-current / gps-saved → GET /service-providers/nearby
 *     (Haversine radius search), same RADIUS_KM/HOME_LIMIT as before.
 *   - city                    → Phase 3's GET /service-providers?city=
 *     (serviceAreaCities `has` filter), capped to HOME_LIMIT.
 *   - fallback                → same endpoint with no city param —
 *     general/unfiltered directory. The section never disappears for
 *     lack of location; only a genuine empty result (no providers at
 *     all) hides it.
 *
 * Fallback cascade: a failed or empty GPS/nearby query now falls
 * through to the same general/unfiltered directory query the
 * `fallback` source itself uses (audit §6) — a nearby search that
 * errors or genuinely finds nobody within RADIUS_KM no longer leaves
 * the section empty when a general directory listing could still show
 * something. A failed/empty city query cascades the same way. Only
 * ever one step down to a single fixed general query, so there's no
 * possibility of a refetch loop.
 *
 * All three underlying queries are called unconditionally (Rules of
 * Hooks) and gated via their own `enabled`/null-params mechanism.
 */
export function useNearbyProvidersForHome() {
  const location = useLocationResolver();

  const isGps = location.source === 'gps-current' || location.source === 'gps-saved';
  const isCity = location.source === 'city';

  const nearbyParams = isGps
    ? { lat: location.latitude!, lng: location.longitude!, radius: RADIUS_KM, limit: HOME_LIMIT }
    : null;
  const nearbyQuery = useNearbyServiceProviders(nearbyParams);

  const cityQuery = useServiceProviders(
    isCity ? { city: location.city, limit: HOME_LIMIT } : undefined,
    { enabled: isCity },
  );

  // Always-available cascade target for both the GPS and city
  // branches, and the query the `fallback` source itself shows
  // directly — same general/unfiltered directory, no city param.
  const generalQuery = useServiceProviders({ limit: HOME_LIMIT });

  const isChecking = location.isLoading;
  const generalResult = {
    isChecking,
    source: 'general' as NearbyProvidersForHomeSource,
    data: generalQuery.data,
    isLoading: generalQuery.isLoading,
    isError: generalQuery.isError,
  };

  if (isGps) {
    if (nearbyQuery.isLoading) {
      return { isChecking, source: 'gps' as NearbyProvidersForHomeSource, data: undefined, isLoading: true, isError: false };
    }
    const nearbyItems = nearbyQuery.data?.items ?? [];
    if (!nearbyQuery.isError && nearbyItems.length > 0) {
      return { isChecking, source: 'gps' as NearbyProvidersForHomeSource, data: nearbyQuery.data, isLoading: false, isError: false };
    }
    return generalResult;
  }

  if (isCity) {
    if (cityQuery.isLoading) {
      return { isChecking, source: 'city' as NearbyProvidersForHomeSource, data: undefined, isLoading: true, isError: false };
    }
    const cityItems = cityQuery.data?.items ?? [];
    if (!cityQuery.isError && cityItems.length > 0) {
      return { isChecking, source: 'city' as NearbyProvidersForHomeSource, data: cityQuery.data, isLoading: false, isError: false };
    }
    return generalResult;
  }

  return generalResult;
}
