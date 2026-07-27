/**
 * Sellers API — maps to backend /api/v1/sellers/* endpoints.
 * See seller-profile-design.md — seller is a state (SellerProfile row),
 * not a Role, so there is no separate "become seller" role-change call.
 */
import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  SellerProfile,
  SellerProfileWithAds,
  CreateSellerProfilePayload,
  CreateSellerRatingPayload,
} from '@/types/seller.types';

export const sellersApi = {
  /** POST /sellers/me/profile — creates the caller's seller profile (once). */
  createMyProfile: (payload: CreateSellerProfilePayload) =>
    apiClient.post<ApiResponse<SellerProfile>>('/sellers/me/profile', payload),

  /** GET /sellers/me/profile — the caller's own seller profile. 404 if none yet. */
  getMyProfile: () =>
    apiClient.get<ApiResponse<SellerProfile>>('/sellers/me/profile'),

  /** GET /sellers/:id — public seller page, no authentication required. */
  getById: (id: string) =>
    apiClient.get<ApiResponse<SellerProfileWithAds>>(`/sellers/${id}`),

  /** POST /sellers/:id/ratings — rate a seller (requires login). */
  createRating: (sellerProfileId: string, payload: CreateSellerRatingPayload) =>
    apiClient.post<ApiResponse<null>>(`/sellers/${sellerProfileId}/ratings`, payload),
};
