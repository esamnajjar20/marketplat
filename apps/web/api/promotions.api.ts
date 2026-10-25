/**
 * Promotions API — maps to backend /api/v1/promotions/* endpoints.
 * Verified against promotions.routes.ts / promotions.controller.ts /
 * promotions.validation.ts directly:
 *   - All routes are JSON, store-owner-only (no public GET — see
 *     promotions.routes.ts's doc comment: public consumers see
 *     promotion effects through products.api.ts's effectivePrice
 *     fields instead, never through this module directly).
 *   - GET /me is registered before GET /:id on the backend, same
 *     convention as products.api.ts's getMine()/getById().
 *   - DELETE /:id cancels (soft) rather than hard-deleting — mirrors
 *     the "cancel" naming in promotions.service.ts.
 */
import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  Promotion,
  CreatePromotionPayload,
  UpdatePromotionPayload,
} from '@/types/promotion.types';

export const promotionsApi = {
  /** POST /promotions */
  create: (payload: CreatePromotionPayload) =>
    apiClient.post<ApiResponse<Promotion>>('/promotions', payload),

  /** GET /promotions/me — caller's own store's promotions (not paginated — MVP list size). */
  getMine: () => apiClient.get<ApiResponse<Promotion[]>>('/promotions/me'),

  /** GET /promotions/:id */
  getById: (id: string) => apiClient.get<ApiResponse<Promotion>>(`/promotions/${id}`),

  /** PATCH /promotions/:id */
  update: (id: string, payload: UpdatePromotionPayload) =>
    apiClient.patch<ApiResponse<Promotion>>(`/promotions/${id}`, payload),

  /** DELETE /promotions/:id — cancels, does not hard-delete. */
  cancel: (id: string) => apiClient.delete<ApiResponse<null>>(`/promotions/${id}`),
};
