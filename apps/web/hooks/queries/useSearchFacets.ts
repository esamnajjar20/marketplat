/**
 * React Query hook for search facets.
 * Place at: apps/web/hooks/queries/useSearchFacets.ts
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { searchFacetsApi, type SearchFacetsParams } from '@/api/search.facets.api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Load facet counts for the filter sheet.
 * Disabled until the sheet is open (pass `enabled: isSheetOpen`).
 */
export function useSearchFacets(
  params: SearchFacetsParams | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.search.facets(params),
    queryFn: ({ signal }) => searchFacetsApi.facets(params, { signal }),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    // Facets are additive UX — failure should not block the sheet.
    retry: 1,
  });
}
