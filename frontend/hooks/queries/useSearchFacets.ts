/**
 * React Query hook for search facets.
 * Place at: frontend/hooks/queries/useSearchFacets.ts
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { searchFacetsApi, type SearchFacetsParams } from '@/api/search.facets.api';
// After merge: import { searchApi } from '@/api/search.api' and use searchApi.facets

function facetsKey(params: SearchFacetsParams | undefined) {
  return ['search', 'facets', params ?? {}] as const;
}

/**
 * Load facet counts for the filter sheet.
 * Disabled until the sheet is open (pass `enabled: isSheetOpen`).
 */
export function useSearchFacets(
  params: SearchFacetsParams | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: facetsKey(params),
    queryFn: ({ signal }) => searchFacetsApi.facets(params, { signal }),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    // Facets are additive UX — failure should not block the sheet.
    retry: 1,
  });
}
