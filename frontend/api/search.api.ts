/**
 * Unified search API — maps to backend /api/v1/search/* endpoints.
 *   - GET /search — cross-entity search (ads + products + stores +
 *     service-listings), paginated the same way every other list
 *     endpoint is.
 *   - GET /search/suggestions — autocomplete, bare array under
 *     `suggestions`, not paginated.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type { SearchResult, SearchQuery, SearchSuggestionsQuery } from '@/types/search.types';

export const searchApi = {
  /** GET /search — unified cross-entity search, paginated. */
  search: (params?: SearchQuery) =>
    apiClient
      .get<ApiResponse<SearchResult[]>>('/search', { params })
      .then((r) => unwrapPaginated<SearchResult>(r)),

  /** GET /search/suggestions — autocomplete, debounced by the caller. */
  suggest: (params: SearchSuggestionsQuery) =>
    apiClient.get<ApiResponse<{ suggestions: string[] }>>('/search/suggestions', { params }),
};
