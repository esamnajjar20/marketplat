'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchApi } from '@/api/search.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { SearchQuery } from '@/types/search.types';

/**
 * GET /search — unified cross-entity search (ads + products + stores +
 * service-listings). Always enabled, same as useAds — the caller (see
 * SearchResults-equivalent component) decides when to render/branch,
 * not this hook. Unlike useSearchAds there's no q-length gate here:
 * an empty q is a valid "browse everything, ranked by relevance
 * fallback" request on this endpoint (see backend's search.repository.ts
 * — rank defaults to 0 with no q, ordering falls back to recency),
 * not an error state.
 */
export function useSearch(params?: SearchQuery) {
  return useQuery({
    queryKey:        queryKeys.search.unified(params),
    queryFn:         () => searchApi.search(params).then((r) => r.data.data),
    placeholderData: keepPreviousData, // prevents flash when changing tabs/pages
    staleTime:       CACHE_TTL.search,
  });
}

/**
 * GET /search/suggestions — autocomplete. Gated at >= 2 trimmed
 * characters, same threshold useSearchAds already established for its
 * own search-vs-browse split — a 1-character prefix matches too much
 * to be a useful suggestion list and would fire on literally the first
 * keystroke.
 */
export function useSearchSuggestions(q: string) {
  return useQuery({
    queryKey:  queryKeys.search.suggestions(q),
    queryFn:   () => searchApi.suggest({ q }).then((r) => r.data.data?.suggestions ?? []),
    staleTime: CACHE_TTL.searchSuggestions,
    enabled:   q.trim().length >= 2,
  });
}
