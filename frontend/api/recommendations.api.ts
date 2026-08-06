/**
 * Recommendations API — maps to backend GET /api/v1/recommendations
 * (Gap #9). Public endpoint: personalizes automatically when the
 * caller is authenticated (apiClient attaches the Bearer token the
 * same way every other request does), falls back to trending ads
 * otherwise. Same bare-array response shape as GET /ads/:id/related —
 * not paginated (see backend recommendations.validation.ts's own
 * comment on why this is a fixed-size shelf, not a list endpoint).
 */
import { apiClient } from './client';
import type { AdListItem } from '@/types/ad.types';
import type { ApiResponse } from '@/types/api.types';

export interface GetRecommendationsParams {
  limit?: number;
  /** Ad-detail-page mode: rank by this ad's own category and exclude it. */
  excludeAdId?: string;
}

export const recommendationsApi = {
  getRecommendations: (params?: GetRecommendationsParams) =>
    apiClient.get<ApiResponse<AdListItem[]>>('/recommendations', { params }),
};
