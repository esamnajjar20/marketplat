'use client';

import { useAds } from '@/hooks/queries/useAds';
import { useSearch } from '@/hooks/queries/useSearch';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import type { AdListItem } from '@/types/ad.types';
import type { SearchResult } from '@/types/search.types';

const HOME_LIMIT = 6;

export type AdsForHomeSource = 'gps' | 'city' | 'general';

interface AdsForHomeResult {
  /** True while the resolver itself is still resolving GPS/permission. */
  isChecking: boolean;
  isLoading: boolean;
  isError: boolean;
  /** Which source actually produced the returned items — for the UI label. Only 'gps'/'city' when that source had real results. */
  source: AdsForHomeSource;
  /**
   * Discriminated so the section component knows which card to render:
   * GET /search returns the normalized SearchResult shape (has
   * distanceKm), GET /ads returns the app's native AdListItem shape.
   * See ads.api.ts / search.api.ts's own docs for why these differ.
   */
  items: { kind: 'search'; data: SearchResult[] } | { kind: 'ads'; data: AdListItem[] };
  /**
   * FIX UI-REVIEW-ERROR-STATE: re-runs whichever query is actually
   * responsible for the current isError:true result — not just
   * generalQuery.refetch unconditionally, since a GPS-branch failure
   * that hasn't yet cascaded (searchQuery still loading/pending retry)
   * has nothing to do with generalQuery. In every branch that reaches
   * generalResult, though, generalQuery.refetch is correct — it's
   * either the branch actually shown (fallback source === 'general')
   * or the thing that needs to succeed for the cascade to stop
   * failing.
   */
  refetch: () => void;
}

/**
 * "أحدث الإعلانات" (Latest Ads) data source for Home.
 *
 * GET /ads has no lat/lng param (only city — see ads.validation.ts's
 * adsQueryBaseSchema). The existing unified search endpoint already
 * supports geo search (GET /search?type=ads&lat&lng&sort=distance —
 * search.validation.ts's searchQuerySchema), so GPS routes through
 * useSearch instead of inventing a new backend endpoint.
 *
 * Priority chain, mirroring useLocationResolver's own gps-current →
 * gps-saved → city → fallback, collapsed to three query branches
 * since gps-current and gps-saved both mean "we have coordinates":
 *
 *   gps-current / gps-saved → GET /search?type=ads&lat&lng&sort=distance
 *   city                    → GET /ads?city={city}
 *   fallback                → GET /ads (general/unfiltered)
 *
 * Fallback cascade: a failed or empty GPS search falls through to
 * general; a failed or empty city fetch falls through to general.
 * Only ever one step down (never GPS → city → general chained), so
 * there's no possibility of a refetch loop — each branch's cascade
 * target is a single, fixed, always-available query.
 *
 * All three underlying queries are called unconditionally (Rules of
 * Hooks). useSearch has no enabled gate (always-on, same convention
 * as useAds itself) so its params are simply undefined when not
 * needed — same pattern useNearbyProvidersForHome already uses via
 * null params. The general query is deliberately always enabled
 * (not gated behind "only when a cascade is needed"): every branch
 * either shows it directly or may need it as a same-render fallback,
 * and it's the same always-on request RecentAds already made before
 * this hook existed, so this introduces no new default-path request.
 */
export function useAdsForHome(): AdsForHomeResult {
  const location = useLocationResolver();

  const isGps = location.source === 'gps-current' || location.source === 'gps-saved';
  const isCity = location.source === 'city';

  const searchParams = isGps
    ? { type: 'ads' as const, lat: location.latitude!, lng: location.longitude!, sort: 'distance' as const, limit: HOME_LIMIT }
    : undefined;
  const searchQuery = useSearch(searchParams);

  const cityQuery = useAds(
    { city: isCity ? location.city : undefined, limit: HOME_LIMIT, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: isCity },
  );

  const generalQuery = useAds({ limit: HOME_LIMIT, sortBy: 'createdAt', sortOrder: 'desc' });

  const isChecking = location.isLoading;
  const generalItems = generalQuery.data?.items ?? [];
  const generalResult = {
    isChecking,
    isLoading: generalQuery.isLoading,
    isError: generalQuery.isError,
    source: 'general' as const,
    items: { kind: 'ads' as const, data: generalItems },
    refetch: () => { generalQuery.refetch(); },
  };

  if (isGps) {
    if (searchQuery.isLoading) {
      return { isChecking, isLoading: true, isError: false, source: 'gps', items: { kind: 'search', data: [] }, refetch: () => { searchQuery.refetch(); } };
    }
    const gpsItems = searchQuery.data?.items ?? [];
    if (!searchQuery.isError && gpsItems.length > 0) {
      return { isChecking, isLoading: false, isError: false, source: 'gps', items: { kind: 'search', data: gpsItems }, refetch: () => { searchQuery.refetch(); } };
    }
    // GPS query failed or came back empty → cascade to general.
    return generalResult;
  }

  if (isCity) {
    if (cityQuery.isLoading) {
      return { isChecking, isLoading: true, isError: false, source: 'city', items: { kind: 'ads', data: [] }, refetch: () => { cityQuery.refetch(); } };
    }
    const cityItems = cityQuery.data?.items ?? [];
    if (!cityQuery.isError && cityItems.length > 0) {
      return { isChecking, isLoading: false, isError: false, source: 'city', items: { kind: 'ads', data: cityItems }, refetch: () => { cityQuery.refetch(); } };
    }
    // City query failed or came back empty → cascade to general.
    return generalResult;
  }

  return generalResult;
}
