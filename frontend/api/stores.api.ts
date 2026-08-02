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
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
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
} from '@/types/store.types';

export const storesApi = {
  /** GET /stores — public directory, paginated. FEATURED-plan stores sort first server-side. */
  getAll: (params?: StoresQuery) =>
    apiClient
      .get<ApiResponse<StoreWithSeller[]>>('/stores', { params })
      .then((r) => unwrapPaginated<StoreWithSeller>(r)),

  /** GET /stores/me — the caller's own store. 404 if none yet. */
  getMyStore: () => apiClient.get<ApiResponse<StoreDetails>>('/stores/me'),

  /** PATCH /stores/me — partial update. */
  updateMyStore: (payload: UpdateStorePayload) =>
    apiClient.patch<ApiResponse<StoreDetails>>('/stores/me', payload),

  /** GET /stores/me/followed — the caller's followed stores, paginated. */
  getMyFollowedStores: (params?: { page?: number; limit?: number }) =>
    apiClient
      .get<ApiResponse<StoreFollowerWithStore[]>>('/stores/me/followed', { params })
      .then((r) => unwrapPaginated<StoreFollowerWithStore>(r)),

  /** POST /stores — one-time store creation (requires an existing SellerProfile). */
  create: (payload: CreateStorePayload) =>
    apiClient.post<ApiResponse<StoreDetails>>('/stores', payload),

  /** GET /stores/:id — public store page, no auth required. */
  getById: (id: string) =>
    apiClient.get<ApiResponse<StoreWithSellerAndCounts>>(`/stores/${id}`),

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
