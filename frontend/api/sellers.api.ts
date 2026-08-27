/**
 * Sellers API — maps to backend /api/v1/sellers/* endpoints.
 * See seller-profile-design.md — seller is a state (SellerProfile row),
 * not a Role, so there is no separate "become seller" role-change call.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type {
  SellerProfile,
  SellerProfileWithAds,
  CreateSellerProfilePayload,
  UpdateSellerProfilePayload,
  CreateSellerRatingPayload,
  SellerRating,
  SellerAttention,
} from '@/types/seller.types';

export const sellersApi = {
  /** POST /sellers/me/profile — creates the caller's seller profile (once). */
  createMyProfile: (payload: CreateSellerProfilePayload) =>
    apiClient.post<ApiResponse<SellerProfile>>('/sellers/me/profile', payload),

  /** GET /sellers/me/profile — the caller's own seller profile. 404 if none yet. */
  getMyProfile: () =>
    apiClient.get<ApiResponse<SellerProfile>>('/sellers/me/profile'),

  /** PATCH /sellers/me/profile — update displayName / bio / avatarUrl. */
  updateMyProfile: (payload: UpdateSellerProfilePayload) =>
    apiClient.patch<ApiResponse<SellerProfile>>('/sellers/me/profile', payload),

  /** GET /sellers/me/attention — lightweight dashboard task counters. */
  getMyAttention: () =>
    apiClient.get<ApiResponse<SellerAttention>>('/sellers/me/attention'),

  /** POST /sellers/me/profile/verification-request — moves the
   *  caller's own profile to verificationStatus PENDING for admin
   *  review. Never sets `verified` itself. */
  requestVerification: () =>
    apiClient.post<ApiResponse<SellerProfile>>('/sellers/me/profile/verification-request'),

  /** GET /sellers/:id — public seller page, no authentication required. */
  getById: (id: string) =>
    apiClient.get<ApiResponse<SellerProfileWithAds>>(`/sellers/${id}`),

  /** POST /sellers/:id/ratings — rate a seller (requires login). */
  createRating: (sellerProfileId: string, payload: CreateSellerRatingPayload) =>
    apiClient.post<ApiResponse<null>>(`/sellers/${sellerProfileId}/ratings`, payload),

  /** GET /sellers/:id/ratings — paginated, public. Same unwrapPaginated shape as serviceReviewsApi.getForSeller/storeReviewsApi's own. */
  getRatings: (sellerProfileId: string, params?: { page?: number; limit?: number }) =>
    apiClient
      .get<ApiResponse<SellerRating[]>>(`/sellers/${sellerProfileId}/ratings`, { params })
      .then((r) => unwrapPaginated<SellerRating>(r)),
};
