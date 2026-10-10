import type { ApiResponse } from '@/types/api.types';
/**
 * Stores API — maps to backend /api/v1/stores/* endpoints.
 * Verified against the stores backend module's stores.routes.ts /
 * stores.controller.ts directly:
 *   - "my store" routes are /me (GET/PATCH), same convention as
 *     service-providers.api.ts's getMyProvider/updateMyProvider — not
 *     a bare collection route.
 *   - /me and /me/followed are registered before /:id on the backend
 *     so they're never swallowed as an :id param — no frontend
 *     implication, just confirms the routes exist as assumed.
 *   - follow/unfollow is a single POST /:id/follow toggle endpoint,
 *     not separate follow/unfollow routes — the response's `action`
 *     field tells the caller which way it went.
 */
import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import { unwrapPaginated } from '@/lib/apiPagination';
import type {
  StoreDetails,
  StoreWithSeller,
  StoreWithSellerAndCounts,
  StoreFollowerWithStore,
  StoreReview,
  CreateStorePayload,
  UpdateStorePayload,
  StoresQuery,
  UpdateStoreStatusPayload,
  ToggleStoreFollowResult,
  CreateStoreReviewPayload,
  StoreReviewsQuery,
  StoreAnalytics,
} from '@/types/store.types';

export const storesApi = {
  /** POST /stores/me/feature-request — ask admin for FEATURED plan */
  requestFeature: () =>
    apiClient.post<ApiResponse<StoreDetails>>(
      '/stores/me/feature-request',
    ),

  /** GET /stores — public directory, paginated. FEATURED-plan stores sort first server-side. */
  getAll: (params?: StoresQuery, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<StoreWithSeller[]>>('/stores', { ...config, params })
      .then((r) => unwrapPaginated<StoreWithSeller>(r)),

  /** GET /stores/me — the caller's own store. 404 if none yet. */
  getMyStore: (config?: AxiosRequestConfig) => apiClient.get<ApiResponse<StoreDetails>>('/stores/me', config),

  /** PATCH /stores/me — partial update. */
  updateMyStore: (payload: UpdateStorePayload) =>
    apiClient.patch<ApiResponse<StoreDetails>>('/stores/me', payload),

  /** POST /stores/me/logo — multipart upload, same shape as usersApi.uploadAvatar. */
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('image', file);
    // FIX MULTIPART-BOUNDARY-01: see api/users.api.ts's comment.
    return apiClient.post<ApiResponse<StoreDetails>>('/stores/me/logo', form);
  },

  /** POST /stores/me/cover — multipart upload, same shape as usersApi.uploadAvatar. */
  uploadCover: (file: File) => {
    const form = new FormData();
    form.append('image', file);
    // FIX MULTIPART-BOUNDARY-01: see api/users.api.ts's comment.
    return apiClient.post<ApiResponse<StoreDetails>>('/stores/me/cover', form);
  },

  /** GET /stores/me/followed — the caller's followed stores, paginated. */
  getMyFollowedStores: (params?: { page?: number; limit?: number }, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<StoreFollowerWithStore[]>>('/stores/me/followed', { ...config, params })
      .then((r) => unwrapPaginated<StoreFollowerWithStore>(r)),

  /** GET /stores/me/analytics — owner-only. See StoreAnalytics's doc
   * comment for why orders/revenue/conversion aren't in this response. */
  getMyStoreAnalytics: (config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<StoreAnalytics>>('/stores/me/analytics', config),

  /** POST /stores — one-time store creation (requires an existing SellerProfile). */
  create: (payload: CreateStorePayload) =>
    apiClient.post<ApiResponse<StoreDetails>>('/stores', payload),

  /** GET /stores/:id — public store page, no auth required. */
  getById: (id: string, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<StoreWithSellerAndCounts>>(`/stores/${id}`, config),

  /** PATCH /stores/:id/status — admin-only approve/block. */
  updateStatus: (id: string, payload: UpdateStoreStatusPayload) =>
    apiClient.patch<ApiResponse<StoreDetails>>(`/stores/${id}/status`, payload),

  /** POST /stores/:id/follow — toggles follow/unfollow. */
  toggleFollow: (id: string) =>
    apiClient.post<ApiResponse<ToggleStoreFollowResult>>(`/stores/${id}/follow`),

  /** GET /stores/:id/reviews — paginated. */
  getReviews: (id: string, params?: StoreReviewsQuery) =>
    apiClient
      .get<ApiResponse<StoreReview[]>>(`/stores/${id}/reviews`, { params })
      .then((r) => unwrapPaginated<StoreReview>(r)),

  /** POST /stores/:id/reviews. */
  createReview: (id: string, payload: CreateStoreReviewPayload) =>
    apiClient.post<ApiResponse<null>>(`/stores/${id}/reviews`, payload),
};
