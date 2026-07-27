/**
 * Service reviews API — maps to backend /api/v1/service-reviews/*.
 * Verified against service-reviews.routes.ts: this is its OWN module,
 * not a sub-resource of service-requests. Reads are keyed by
 * sellerProfileId (denormalised on ServiceReview for fast "all reviews
 * for this seller" queries — see schema.prisma comment), and the
 * create payload references requestId, score, comment — not
 * `POST /service-requests/:id/review` as the original plan sketched.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type { ServiceReview, CreateServiceReviewPayload } from '@/types/service.types';

export const serviceReviewsApi = {
  /** POST /service-reviews */
  create: (payload: CreateServiceReviewPayload) =>
    apiClient.post<ApiResponse<ServiceReview>>('/service-reviews', payload),

  /** GET /service-reviews/seller/:sellerProfileId — paginated. */
  getForSeller: (sellerProfileId: string, params?: { page?: number; limit?: number }) =>
    apiClient
      .get<ApiResponse<ServiceReview[]>>(`/service-reviews/seller/${sellerProfileId}`, { params })
      .then((r) => unwrapPaginated<ServiceReview>(r)),
};
