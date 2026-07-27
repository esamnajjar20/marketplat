/**
 * Service categories API — maps to backend /api/v1/service-categories/*.
 * Public GET routes only used here (admin create/update/delete belong to
 * a future admin-console phase, not this frontend plan's scope).
 */
import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { ServiceCategory } from '@/types/service.types';

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
};
