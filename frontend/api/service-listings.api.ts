/**
 * Service listings API — maps to backend /api/v1/service-listings/*.
 * Verified against service-listings.routes.ts / .validation.ts:
 *   - POST uses signed direct-to-Cloudinary uploads; legacy multipart
 *     clients remain supported through uploadMultipleMiddleware.
 *   - PATCH /:id is plain JSON and has NO images field in its Zod
 *     schema — images are only ever mutated through the two dedicated
 *     endpoints below (Gap #3 fix), never through this general PATCH.
 *   - GET /me is registered before GET /:id on the backend so "me" is
 *     never swallowed as an :id param — no frontend implication, just
 *     confirms the route exists as assumed.
 *   - Gap #3 fix: POST/DELETE /:id/images now exist, mirroring
 *     ads.api.ts's addImages()/removeImage() exactly.
 */
import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import { unwrapPaginated } from '@/lib/apiPagination';
import { OFFLINE_OP_ID_HEADER } from '@/lib/offlineOperationId';
import type { ApiResponse } from '@/types/api.types';
import { uploadImagesDirect } from './direct-upload';
import type {
  ServiceListing,
  ServiceListingWithProvider,
  CreateServiceListingPayload,
  UpdateServiceListingPayload,
  ServiceListingsQuery,
} from '@/types/service.types';

export const serviceListingsApi = {
  /** GET /service-listings — public browse/search, paginated. */
  getAll: (params?: ServiceListingsQuery, config?: AxiosRequestConfig) => {
    const requestParams = params
      ? {
          ...params,
          ...(params.attributeFilters
            ? { attributeFilters: JSON.stringify(params.attributeFilters) }
            : {}),
        }
      : params;
    return apiClient
      .get<ApiResponse<ServiceListingWithProvider[]>>('/service-listings', { ...config, params: requestParams })
      .then((r) => unwrapPaginated<ServiceListingWithProvider>(r));
  },

  /** GET /service-listings/me — caller's own listings, paginated. */
  getMine: (params?: ServiceListingsQuery, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<ServiceListing[]>>('/service-listings/me', { ...config, params })
      .then((r) => unwrapPaginated<ServiceListing>(r)),

  /** GET /service-listings/:id — public detail. */
  getById: (id: string, config?: AxiosRequestConfig) =>
    (config ? apiClient.get<ApiResponse<ServiceListingWithProvider>>(`/service-listings/${id}`, config) : apiClient.get<ApiResponse<ServiceListingWithProvider>>(`/service-listings/${id}`)),

  /**
   * POST /service-listings — JSON with API-issued Cloudinary image IDs;
   * progress tracks the direct image transfer to Cloudinary.
   *
   * operationId (اختياري): نفس نمط ads.api — يُرسَل كـ X-Offline-Op-Id
   * لربط المسودة المحلية (offlineAdDrafts) بعنصر طابور الـ SW.
   */
  create: async (
    payload: CreateServiceListingPayload,
    onUploadProgress?: (percent: number) => void,
    operationId?: string,
  ) => {
    const { images, ...fields } = payload;
    const directImagePublicIds = await uploadImagesDirect(images, 'service-listings', onUploadProgress);
    const response = await apiClient.post<ApiResponse<ServiceListing>>('/service-listings', {
      ...fields,
      directImagePublicIds,
    }, { headers: operationId ? { [OFFLINE_OP_ID_HEADER]: operationId } : undefined });
    onUploadProgress?.(100);
    return response;
  },

  /** PATCH /service-listings/:id — JSON only, no images (see file header). */
  getMatches: (id: string, limit = 8, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<ServiceListingWithProvider[]>>(`/service-listings/${id}/matches`, { ...config, params: { limit } }),

  update: (id: string, payload: UpdateServiceListingPayload, operationId?: string) =>
    apiClient.patch<ApiResponse<ServiceListing>>(`/service-listings/${id}`, payload, {
      headers: operationId ? { [OFFLINE_OP_ID_HEADER]: operationId } : undefined,
    }),

  /** DELETE /service-listings/:id */
  delete: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/service-listings/${id}`),

  /**
   * POST /service-listings/:id/images — add images to an existing
   * listing. Gap #3 fix — mirrors ads.api.ts's addImages() exactly.
   */
  addImages: async (id: string, files: File[], onUploadProgress?: (percent: number) => void) => {
    const directImagePublicIds = await uploadImagesDirect(files, 'service-listings', onUploadProgress);
    const response = await apiClient.post<ApiResponse<ServiceListing>>(`/service-listings/${id}/images`, { directImagePublicIds });
    onUploadProgress?.(100);
    return response;
  },

  /** DELETE /service-listings/:id/images — remove one image by URL. Gap #3 fix. */
  removeImage: (id: string, imageUrl: string) =>
    apiClient.delete<ApiResponse<ServiceListing>>(`/service-listings/${id}/images`, {
      data: { imageUrl },
    }),

  /**
   * PUT /service-listings/:id/images/reorder — Gap #11. Body must be a
   * permutation of the listing's current image URLs.
   */
  reorderImages: (id: string, images: string[]) =>
    apiClient.put<ApiResponse<ServiceListing>>(`/service-listings/${id}/images/reorder`, { images }),
};
