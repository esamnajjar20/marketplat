/**
 * Facets API client.
 * Merge into apps/web/api/search.api.ts as searchApi.facets
 */

import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@/types/api.types';
import type { SearchQuery } from '@/types/search.types';

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface SearchFacetsResponse {
  cities: FacetBucket[];
  categories: FacetBucket[];
  conditions: FacetBucket[];
  priceRanges: FacetBucket[];
  total: number;
}

/** Params accepted by GET /search/facets (subset of SearchQuery). */
export type SearchFacetsParams = Pick<
  SearchQuery,
  | 'q'
  | 'city'
  | 'type'
  | 'categoryId'
  | 'minPrice'
  | 'maxPrice'
  | 'condition'
  | 'lat'
  | 'lng'
  | 'radius'
>;

export const searchFacetsApi = {
  /** GET /search/facets */
  facets: (params?: SearchFacetsParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<SearchFacetsResponse>>('/search/facets', {
        ...config,
        params,
      })
      .then((r) => r.data.data),
};

/** Suggested merge into search.api.ts:
 *
 *  facets: searchFacetsApi.facets,
 */
