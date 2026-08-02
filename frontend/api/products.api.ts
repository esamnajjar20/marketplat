/**
 * Products API — maps to backend /api/v1/products/* endpoints.
 * Verified against the products backend module's products.routes.ts /
 * products.controller.ts / products.validation.ts directly:
 *   - POST is multipart/form-data (uploadMultipleMiddleware) — same
 *     pattern as ads.api.ts's create() / service-listings.api.ts's create().
 *   - PATCH /:id is plain JSON and has NO images field in its Zod
 *     schema — there is no dedicated image-replace endpoint for
 *     products (same limitation service listings have).
 *   - GET /me is registered before GET /:id on the backend so "me" is
 *     never swallowed as an :id param.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
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
  getAll: (params?: ProductsQuery) =>
    apiClient
      .get<ApiResponse<ProductWithStore[]>>('/products', { params })
      .then((r) => unwrapPaginated<ProductWithStore>(r)),

  /** GET /products/me — caller's own products (owner-only, my-store page), paginated. */
  getMine: (params?: ProductsQuery) =>
    apiClient
      .get<ApiResponse<Product[]>>('/products/me', { params })
      .then((r) => unwrapPaginated<Product>(r)),

  /** GET /products/:id — public detail. */
  getById: (id: string) =>
    apiClient.get<ApiResponse<ProductWithFullStore>>(`/products/${id}`),

  /**
   * POST /products — multipart/form-data, same field-append pattern as
   * ads.api.ts / service-listings.api.ts. Accepts an optional
   * onUploadProgress callback so ImageUpload can drive a real progress
   * bar during the multipart upload.
   */
  create: (payload: CreateProductPayload, onUploadProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('categoryId', payload.categoryId);
    form.append('name', payload.name);
    form.append('description', payload.description);
    form.append('price', String(payload.price));
    if (payload.discountPrice !== undefined) form.append('discountPrice', String(payload.discountPrice));
    if (payload.wholesalePrice !== undefined) form.append('wholesalePrice', String(payload.wholesalePrice));
    if (payload.wholesaleMinQty !== undefined) form.append('wholesaleMinQty', String(payload.wholesaleMinQty));
    if (payload.availability) form.append('availability', payload.availability);
    payload.images.forEach((file) => form.append('images', file));

    return apiClient.post<ApiResponse<Product>>('/products', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onUploadProgress
        ? (e) => onUploadProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    });
  },

  /** PATCH /products/:id — JSON only, no images (see file header). */
  update: (id: string, payload: UpdateProductPayload) =>
    apiClient.patch<ApiResponse<Product>>(`/products/${id}`, payload),

  /** DELETE /products/:id */
  delete: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/products/${id}`),
};
