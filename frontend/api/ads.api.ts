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
import { buildFilterParams, type FilterPatch } from '../../shared/filters';
import type { AxiosRequestConfig } from 'axios';
import { unwrapPaginated } from '@/lib/apiPagination';
import { OFFLINE_OP_ID_HEADER } from '@/lib/offlineOperationId';
import type {
  Ad,
  AdListItem,
  CreateAdPayload,
  UpdateAdPayload,
  AdSearchParams,
  AdSearchQuery,
} from '@/types/ad.types';
import type { ApiResponse } from '@/types/api.types';
import { uploadImagesDirect } from './direct-upload';

export const adsApi = {
  /** GET /ads — paginated + filtered list */
  getAll: (params?: AdSearchParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<AdListItem[]>>('/ads', { ...config, params: params ? buildFilterParams({ ...params } as FilterPatch, { profile: 'adsBrowse' }) : undefined })
      .then((r) => unwrapPaginated<AdListItem>(r)),

  /**
   * GET /ads/search — full-text search.
   * FIX API-02: uses 'q' as the required search term (backend searchAdsSchema).
   * Spread AdSearchQuery so sortBy/sortOrder/city/etc are also sent.
   */
  searchAds: (params: AdSearchQuery, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<AdListItem[]>>('/ads/search', { ...config, params: buildFilterParams({ ...params } as FilterPatch, { profile: 'adsBrowse' }) })
      .then((r) => unwrapPaginated<AdListItem>(r)),

  /** GET /ads/:id — full detail */
  getById: (id: string, config?: AxiosRequestConfig) =>
    (config ? apiClient.get<ApiResponse<Ad>>(`/ads/${id}`, config) : apiClient.get<ApiResponse<Ad>>(`/ads/${id}`)),

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
  getRelated: (id: string, config?: AxiosRequestConfig) =>
    (config ? apiClient.get<ApiResponse<AdListItem[]>>(`/ads/${id}/related`, config) : apiClient.get<ApiResponse<AdListItem[]>>(`/ads/${id}/related`)),

  /**
   * GET /ads/me — current user's ads.
   * FIX C-06: was '/ads/my' — correct endpoint is '/ads/me'.
   */
  getMyAds: (params?: Pick<AdSearchParams, 'page' | 'limit' | 'status'>, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<AdListItem[]>>('/ads/me', { ...config, params: params ? buildFilterParams({ ...params } as FilterPatch, { profile: 'myAds' }) : undefined })
      .then((r) => unwrapPaginated<AdListItem>(r)),

  /**
   * GET /ads/me/stats — aggregate counts for the dashboard
   * (active/sold ads, total views, favorites count). Not paginated —
   * bare object response, no unwrapPaginated needed.
   */
  getMyStats: (config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<{
      activeAds: number;
      soldAds: number;
      totalAds: number;
      totalViews: number;
      favoritesCount: number;
    }>>('/ads/me/stats', config),

  /**
   * POST /ads — create new ad using direct Cloudinary uploads (legacy multipart remains supported).
   *
   * The optional progress callback tracks the direct browser-to-Cloudinary
   * transfer, without routing image bytes through the Express API.
   */
  /**
   * operationId (اختياري): FIX AD-DRAFT-QUEUE-LINK-01 — يُرسَل كـ header
   * عادي فيُخزَّن تلقائيًا مع أي نسخة من هذا الطلب تدخل طابور الـ SW عند
   * فشل الشبكة (handleMutation بـ sw.js يحفظ كل الـ headers أصلًا). يسمح
   * لاحقًا بربط مسودة الإعلان (lib/offlineAdDrafts.ts) بحالة الطابور
   * الفعلية بدل أن يكونا مصدرين منفصلين لا يتزامنان أبدًا — انظر
   * lib/offlineAdDraftSync.ts.
   */
  create: async (
    payload: CreateAdPayload,
    onUploadProgress?: (percent: number) => void,
    operationId?: string,
  ) => {
    const { images, ...fields } = payload;
    const directImagePublicIds = await uploadImagesDirect(images ?? [], 'ads', onUploadProgress);
    const response = await apiClient.post<ApiResponse<Ad>>('/ads', {
      ...fields,
      directImagePublicIds,
    }, {
      headers: operationId ? { [OFFLINE_OP_ID_HEADER]: operationId } : undefined,
    });
    onUploadProgress?.(100);
    return response;
  },

  /** PATCH /ads/:id — partial update (status, title, price, etc.) */
  update: (id: string, payload: UpdateAdPayload, operationId?: string) =>
    apiClient.patch<ApiResponse<Ad>>(`/ads/${id}`, payload, {
      headers: operationId ? { [OFFLINE_OP_ID_HEADER]: operationId } : undefined,
    }),

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
  addImages: async (id: string, files: File[], onUploadProgress?: (percent: number) => void) => {
    const directImagePublicIds = await uploadImagesDirect(files, 'ads', onUploadProgress);
    const response = await apiClient.post<ApiResponse<Ad>>(`/ads/${id}/images`, { directImagePublicIds });
    onUploadProgress?.(100);
    return response;
  },

  /** DELETE /ads/:id/images — remove one image by URL */
  removeImage: (id: string, imageUrl: string) =>
    apiClient.delete<ApiResponse<Ad>>(`/ads/${id}/images`, {
      data: { imageUrl },
    }),

  /**
   * PUT /ads/:id/images/reorder — Gap #11. Body must be a permutation
   * of the ad's current image URLs (same set, new order) — the backend
   * rejects anything else with IMAGES_MISMATCH.
   */
  reorderImages: (id: string, images: string[]) =>
    apiClient.put<ApiResponse<Ad>>(`/ads/${id}/images/reorder`, { images }),
};
