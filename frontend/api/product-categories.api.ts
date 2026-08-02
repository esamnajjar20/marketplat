/**
 * Product categories API — maps to backend /api/v1/product-categories/*.
 * Mirrors service-categories.api.ts exactly — verified against the
 * product-categories backend module's product-categories.routes.ts,
 * which uses the identical /admin/all-before-/:id convention.
 */
import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  ProductCategory,
  CreateProductCategoryPayload,
  UpdateProductCategoryPayload,
} from '@/types/product.types';

export const productCategoriesApi = {
  /** GET /product-categories */
  getAll: () =>
    apiClient.get<ApiResponse<ProductCategory[]>>('/product-categories'),

  /** GET /product-categories/slug/:slug */
  getBySlug: (slug: string) =>
    apiClient.get<ApiResponse<ProductCategory>>(`/product-categories/slug/${slug}`),

  /** GET /product-categories/:id */
  getById: (id: string) =>
    apiClient.get<ApiResponse<ProductCategory>>(`/product-categories/${id}`),

  // ── Admin operations ──────────────────────────────────────────────

  /** GET /product-categories/admin/all — every category including inactive ones, uncached. */
  getAllForAdmin: () =>
    apiClient.get<ApiResponse<ProductCategory[]>>('/product-categories/admin/all'),

  create: (payload: CreateProductCategoryPayload) =>
    apiClient.post<ApiResponse<ProductCategory>>('/product-categories', payload),

  update: (id: string, payload: UpdateProductCategoryPayload) =>
    apiClient.patch<ApiResponse<ProductCategory>>(`/product-categories/${id}`, payload),

  delete: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/product-categories/${id}`),
};
