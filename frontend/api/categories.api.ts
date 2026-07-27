/**
 * Categories API — maps to backend /api/v1/categories/* endpoints.
 *
 * FIX C-07: getBySlug now calls '/categories/slug/:slug'
 *           (was incorrectly '/categories/:slug').
 *           Backend route: GET /categories/slug/:slug
 */
import { apiClient } from './client';
import type { Category, CreateCategoryPayload, UpdateCategoryPayload } from '@/types/category.types';
import type { ApiResponse } from '@/types/api.types';

export const categoriesApi = {
  /** GET /categories — full tree with children */
  getAll: () =>
    apiClient.get<ApiResponse<Category[]>>('/categories'),

  /**
   * GET /categories/slug/:slug
   * FIX C-07: backend route is /categories/slug/:slug not /categories/:slug.
   */
  getBySlug: (slug: string) =>
    apiClient.get<ApiResponse<Category>>(`/categories/slug/${slug}`),

  // L-7 (audit fix): getById (GET /categories/:id) removed — grepped
  // across components/hooks/tests and found zero callers. The app only
  // ever fetches categories via getAll() (full tree, used to build the
  // category picker/nav) or getBySlug() (category landing pages). The
  // backend route GET /categories/:id itself stays — it's a reasonable
  // general-purpose endpoint (categories.routes.ts) even with no
  // current frontend caller, and removing a working route isn't part
  // of this fix. If a future admin "edit category by ID" screen needs
  // this, it's a one-line re-add.

  // ── Admin operations ─────────────────────────────────────────────

  create: (payload: CreateCategoryPayload) =>
    apiClient.post<ApiResponse<Category>>('/categories', payload),

  update: (id: string, payload: UpdateCategoryPayload) =>
    apiClient.patch<ApiResponse<Category>>(`/categories/${id}`, payload),

  delete: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/categories/${id}`),
};
