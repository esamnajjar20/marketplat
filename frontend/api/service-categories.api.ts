/**
 * Service categories API — maps to backend /api/v1/service-categories/*.
 *
 * EPIC 1.2: admin create/update/delete were previously out of scope
 * ("a future admin-console phase") — this closes that gap, mirroring
 * categories.api.ts's admin section exactly. Backend routes
 * (service-categories.routes.ts) were already admin-protected and
 * fully implemented; only the frontend client was missing.
 */
import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  ServiceCategory,
  CreateServiceCategoryPayload,
  UpdateServiceCategoryPayload,
} from '@/types/service.types';

export const serviceCategoriesApi = {
  /** GET /service-categories */
  getAll: () =>
    apiClient.get<ApiResponse<ServiceCategory[]>>('/service-categories'),

  /** GET /service-categories/slug/:slug */
  getBySlug: (slug: string) =>
    apiClient.get<ApiResponse<ServiceCategory>>(`/service-categories/slug/${slug}`),

  /** GET /service-categories/:id */
  getById: (id: string) =>
    apiClient.get<ApiResponse<ServiceCategory>>(`/service-categories/${id}`),

  // ── Admin operations (Epic 1.2) ──────────────────────────────────

  /**
   * GET /service-categories/admin/all — deliberately separate from
   * getAll() above: returns every category including inactive ones,
   * uncached (see service-categories.service.ts's
   * getServiceCategoriesForAdmin), which getAll()'s public tree never did.
   */
  getAllForAdmin: () =>
    apiClient.get<ApiResponse<ServiceCategory[]>>('/service-categories/admin/all'),

  create: (payload: CreateServiceCategoryPayload) =>
    apiClient.post<ApiResponse<ServiceCategory>>('/service-categories', payload),

  update: (id: string, payload: UpdateServiceCategoryPayload) =>
    apiClient.patch<ApiResponse<ServiceCategory>>(`/service-categories/${id}`, payload),

  delete: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/service-categories/${id}`),
};
