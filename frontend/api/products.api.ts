/**
 * Products API — maps to backend /api/v1/products/* endpoints.
 * Verified against the products backend module's products.routes.ts /
 * products.controller.ts / products.validation.ts directly:
 *   - POST uses signed direct-to-Cloudinary uploads; the backend still
 *     accepts legacy multipart clients through uploadMultipleMiddleware.
 *   - PATCH /:id is plain JSON and has NO images field in its Zod
 *     schema — images are only ever mutated through the two dedicated
 *     endpoints below (Gap #3 fix), never through this general PATCH.
 *   - GET /me is registered before GET /:id on the backend so "me" is
 *     never swallowed as an :id param.
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
  Product,
  ProductWithStore,
  ProductWithFullStore,
  CreateProductPayload,
  UpdateProductPayload,
  ProductsQuery,
} from '@/types/product.types';

export const productsApi = {
  /** GET /products — public browse/search, paginated. */
  getAll: (params?: ProductsQuery, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<ProductWithStore[]>>('/products', { ...config, params })
      .then((r) => unwrapPaginated<ProductWithStore>(r)),

  /** GET /products/me — caller's own products (owner-only, my-store page), paginated. */
  getMine: (params?: ProductsQuery, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<Product[]>>('/products/me', { ...config, params })
      .then((r) => unwrapPaginated<Product>(r)),

  /** GET /products/:id — public detail. */
  getById: (id: string, config?: AxiosRequestConfig) =>
    (config ? apiClient.get<ApiResponse<ProductWithFullStore>>(`/products/${id}`, config) : apiClient.get<ApiResponse<ProductWithFullStore>>(`/products/${id}`)),

  /**
   * POST /products — upload image bytes directly to Cloudinary, then
   * send API-issued public IDs as JSON. Progress tracks image transfer.
   *
   * operationId (اختياري): نفس نمط ads.api — يُرسَل كـ X-Offline-Op-Id
   * لربط المسودة المحلية (offlineAdDrafts) بعنصر طابور الـ SW.
   */
  create: async (
    payload: CreateProductPayload,
    onUploadProgress?: (percent: number) => void,
    operationId?: string,
  ) => {
    const { images, ...fields } = payload;
    const directImagePublicIds = await uploadImagesDirect(images, 'products', onUploadProgress);
    const response = await apiClient.post<ApiResponse<Product>>('/products', {
      ...fields,
      directImagePublicIds,
    }, { headers: operationId ? { [OFFLINE_OP_ID_HEADER]: operationId } : undefined });
    onUploadProgress?.(100);
    return response;
  },

  /** PATCH /products/:id — JSON only, no images (see file header). */
  update: (id: string, payload: UpdateProductPayload, operationId?: string) =>
    apiClient.patch<ApiResponse<Product>>(`/products/${id}`, payload, {
      headers: operationId ? { [OFFLINE_OP_ID_HEADER]: operationId } : undefined,
    }),

  /** DELETE /products/:id */
  delete: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/products/${id}`),

  /**
   * POST /products/:id/images — add images to an existing product.
   * Gap #3 fix — mirrors ads.api.ts's addImages() exactly, including
   * onUploadProgress support for ImageUpload's progress bar.
   */
  addImages: async (id: string, files: File[], onUploadProgress?: (percent: number) => void) => {
    const directImagePublicIds = await uploadImagesDirect(files, 'products', onUploadProgress);
    const response = await apiClient.post<ApiResponse<Product>>(`/products/${id}/images`, { directImagePublicIds });
    onUploadProgress?.(100);
    return response;
  },

  /** DELETE /products/:id/images — remove one image by URL. Gap #3 fix. */
  removeImage: (id: string, imageUrl: string) =>
    apiClient.delete<ApiResponse<Product>>(`/products/${id}/images`, {
      data: { imageUrl },
    }),

  /**
   * PUT /products/:id/images/reorder — Gap #11. Body must be a
   * permutation of the product's current image URLs.
   */
  reorderImages: (id: string, images: string[]) =>
    apiClient.put<ApiResponse<Product>>(`/products/${id}/images/reorder`, { images }),
};
