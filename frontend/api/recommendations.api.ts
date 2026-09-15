/**
 * Recommendations API — maps to backend GET /api/v1/recommendations
 * (Gap #9). Public endpoint: personalizes automatically when the
 * caller is authenticated (apiClient attaches the Bearer token the
 * same way every other request does), falls back to trending ads
 * otherwise. Same bare-array response shape as GET /ads/:id/related —
 * not paginated (see backend recommendations.validation.ts's own
 * comment on why this is a fixed-size shelf, not a list endpoint).
 *
 * PR4C: the backend dispatches on a single `type` query param — see
 * recommendations.controller.ts — rather than exposing four separate
 * routes, so this stays a single thin client rather than four
 * duplicated ones. `type` is omitted for ads (byte-identical to the
 * pre-existing default the backend already treats `type`-absent as),
 * preserving getRecommendations()'s exact existing contract/callers.
 */
import { apiClient } from './client';
import type { AdListItem } from '@/types/ad.types';
import type { ProductWithStore } from '@/types/product.types';
import type { ServiceListingWithProvider } from '@/types/service.types';
import type { StoreWithSeller } from '@/types/store.types';
import type { ApiResponse } from '@/types/api.types';

export interface GetRecommendationsParams {
  limit?: number;
  /** Ad-detail-page mode: rank by this ad's own category and exclude it. */
  excludeAdId?: string;
  /** تفضيل إعلانات نفس المدينة في الترتيب */
  city?: string;
}

/** Product-detail-context mode: rank by this product's own category and exclude it. */
export interface GetProductRecommendationsParams {
  limit?: number;
  excludeProductId?: string;
}

/** Service-detail-page mode: rank by this listing's own category and exclude it. */
export interface GetServiceRecommendationsParams {
  limit?: number;
  excludeServiceListingId?: string;
}

/**
 * Store-detail-page mode. lat/lng are the location/distance ranking
 * signal storeRecommendationsRepository.findRanked reads — optional on
 * both the backend (see recommendations.validation.ts) and here; a
 * caller with no coordinates simply omits them rather than sending a
 * sentinel value.
 */
export interface GetStoreRecommendationsParams {
  limit?: number;
  excludeStoreId?: string;
  lat?: number;
  lng?: number;
}

export const recommendationsApi = {
  getRecommendations: (params?: GetRecommendationsParams) =>
    apiClient.get<ApiResponse<AdListItem[]>>('/recommendations', { params }),

  getProductRecommendations: (params?: GetProductRecommendationsParams) =>
    apiClient.get<ApiResponse<ProductWithStore[]>>('/recommendations', {
      params: { ...params, type: 'product' },
    }),

  getServiceRecommendations: (params?: GetServiceRecommendationsParams) =>
    apiClient.get<ApiResponse<ServiceListingWithProvider[]>>('/recommendations', {
      params: { ...params, type: 'service' },
    }),

  getStoreRecommendations: (params?: GetStoreRecommendationsParams) =>
    apiClient.get<ApiResponse<StoreWithSeller[]>>('/recommendations', {
      params: { ...params, type: 'store' },
    }),
};
