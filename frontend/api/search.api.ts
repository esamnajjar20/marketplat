/**
 * Unified search API — maps to backend /api/v1/search/* endpoints.
 *   - GET /search — cross-entity search (ads + products + stores +
 *     service-listings), paginated the same way every other list
 *     endpoint is.
 *   - GET /search/suggestions — autocomplete, bare array under
 *     `suggestions`, not paginated.
 */
import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type { SearchResult, SearchQuery, SearchSuggestionsQuery } from '@/types/search.types';
import { buildFilterParams, type FilterPatch } from '../../shared/filters';

export const searchApi = {
  /** GET /search — unified cross-entity search, paginated. */
  search: (params?: SearchQuery, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<SearchResult[]>>('/search', { ...config, params: params ? buildFilterParams({ ...params } as FilterPatch, { profile: 'globalSearch' }) : undefined })
      .then((r) => unwrapPaginated<SearchResult>(r)),

  /** GET /search/suggestions — autocomplete, debounced by the caller. */
  suggest: (params: SearchSuggestionsQuery, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<{ suggestions: string[] }>>('/search/suggestions', { ...config, params: buildFilterParams({ q: params.q }, { profile: 'globalSearch' }) }),
};
