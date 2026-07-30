/**
 * Ads API — maps to backend /api/v1/ads/* endpoints.
 *
 * FIX C-06: getMyAds uses '/ads/me' (not '/ads/my').
 * FIX T-05: params use sortBy/sortOrder (not sort/order).
 * FIX API-02: added searchAds() calling GET /ads/search with 'q' param.
 * FIX M-01: there is no dedicated POST /ads/:id/sold endpoint — markAsSold
 *           below uses the general PATCH /ads/:id with { status: 'SOLD' }.
 * FIX API-SHAPE-01: getAll/searchAds/getMyAds now unwrap the backend's
 *   real response shape (data: T[] directly, meta.pagination for paging)
 *   via unwrapPaginated — see lib/apiPagination.ts for the full story.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type {
  Ad,
  AdListItem,
  CreateAdPayload,
  UpdateAdPayload,
  AdSearchParams,
  AdSearchQuery,
} from '@/types/ad.types';
import type { ApiResponse } from '@/types/api.types';

export const adsApi = {
  /** GET /ads — paginated + filtered list */
  getAll: (params?: AdSearchParams) =>
    apiClient
      .get<ApiResponse<AdListItem[]>>('/ads', { params })
      .then((r) => unwrapPaginated<AdListItem>(r)),

  /**
   * GET /ads/search — full-text search.
   * FIX API-02: uses 'q' as the required search term (backend searchAdsSchema).
   * Spread AdSearchQuery so sortBy/sortOrder/city/etc are also sent.
   */
  searchAds: (params: AdSearchQuery) =>
    apiClient
      .get<ApiResponse<AdListItem[]>>('/ads/search', { params })
      .then((r) => unwrapPaginated<AdListItem>(r)),

  /** GET /ads/:id — full detail */
  getById: (id: string) =>
    apiClient.get<ApiResponse<Ad>>(`/ads/${id}`),

  /**
   * GET /ads/:id/related — similar listings.
   * FIX API-SHAPE-02: unlike getAll/searchAds/getMyAds, this endpoint is
   * NOT paginated — the backend (ads.controller.ts's getRelatedAds) calls
   * successResponse('Related ads fetched', ads) with no third `meta`
   * argument at all, so `data` here is a bare AdWithAuthor[], not
   * { items: [...] }. useRelatedAds's `.then(r => r.data.data?.items ?? [])`
   * was therefore always reading an `.items` that never existed on a
   * bare array, silently falling through to `[]` every time — the
   * "related ads" section was empty on every single ad detail page.
   */
  getRelated: (id: string) =>
    apiClient.get<ApiResponse<AdListItem[]>>(`/ads/${id}/related`),

  /**
   * GET /ads/me — current user's ads.
   * FIX C-06: was '/ads/my' — correct endpoint is '/ads/me'.
   */
  getMyAds: (params?: Pick<AdSearchParams, 'page' | 'limit' | 'status'>) =>
    apiClient
      .get<ApiResponse<AdListItem[]>>('/ads/me', { params })
      .then((r) => unwrapPaginated<AdListItem>(r)),

  /**
   * POST /ads — create new ad (multipart/form-data).
   *
   * UX-FIX P3-10b: accepts an optional onUploadProgress callback so
   * ImageUpload can show a real progress bar during the actual upload
   * (create/edit ad submission) instead of no feedback at all between
   * "Publish" and the success toast. This is one combined percentage for
   * the whole multipart request — axios reports progress at the request
   * level, not per-file within a single FormData — but that's still a
   * large, honest improvement over a multi-second silent wait on a slow
   * connection with several photos attached.
   */
  create: (payload: CreateAdPayload, onUploadProgress?: (percent: number) => void) => {
    const form = new FormData();
    (Object.keys(payload) as (keyof CreateAdPayload)[]).forEach((key) => {
      const value = payload[key];
      if (value === undefined) return;
      if (key === 'images' && Array.isArray(value)) {
        (value as File[]).forEach((file) => form.append('images', file));
      } else {
        form.append(key, String(value));
      }
    });
    return apiClient.post<ApiResponse<Ad>>('/ads', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onUploadProgress
        ? (e) => onUploadProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    });
  },

  /** PATCH /ads/:id — partial update (status, title, price, etc.) */
  update: (id: string, payload: UpdateAdPayload) =>
    apiClient.patch<ApiResponse<Ad>>(`/ads/${id}`, payload),

  /**
   * Mark ad as SOLD via the general update endpoint.
   * FIX M-01: no dedicated /sold endpoint exists — use PATCH with status.
   */
  markAsSold: (id: string) =>
    apiClient.patch<ApiResponse<Ad>>(`/ads/${id}`, { status: 'SOLD' }),

  /** DELETE /ads/:id — soft delete (sets status to DELETED) */
  delete: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/ads/${id}`),

  /**
   * POST /ads/:id/images — add images to existing ad.
   * UX-FIX P3-10b: same onUploadProgress support as create(), for the
   * edit-ad flow.
   */
  addImages: (id: string, files: File[], onUploadProgress?: (percent: number) => void) => {
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    return apiClient.post<ApiResponse<Ad>>(`/ads/${id}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onUploadProgress
        ? (e) => onUploadProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    });
  },

  /** DELETE /ads/:id/images — remove one image by URL */
  removeImage: (id: string, imageUrl: string) =>
    apiClient.delete<ApiResponse<Ad>>(`/ads/${id}/images`, {
      data: { imageUrl },
    }),
};
