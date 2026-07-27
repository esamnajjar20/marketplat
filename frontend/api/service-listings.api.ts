/**
 * Service listings API — maps to backend /api/v1/service-listings/*.
 * Verified against service-listings.routes.ts / .validation.ts:
 *   - POST is multipart/form-data (uploadMultipleMiddleware) — same
 *     pattern as ads.api.ts's create().
 *   - PATCH /:id is plain JSON and has NO images field in its Zod
 *     schema — there is no dedicated image-replace endpoint for service
 *     listings (unlike ads' /ads/:id/images). Editing photos on an
 *     existing listing is out of scope until the backend adds one.
 *   - GET /me is registered before GET /:id on the backend so "me" is
 *     never swallowed as an :id param — no frontend implication, just
 *     confirms the route exists as assumed.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type {
  ServiceListing,
  ServiceListingWithProvider,
  CreateServiceListingPayload,
  UpdateServiceListingPayload,
  ServiceListingsQuery,
} from '@/types/service.types';

export const serviceListingsApi = {
  /** GET /service-listings — public browse/search, paginated. */
  getAll: (params?: ServiceListingsQuery) =>
    apiClient
      .get<ApiResponse<ServiceListingWithProvider[]>>('/service-listings', { params })
      .then((r) => unwrapPaginated<ServiceListingWithProvider>(r)),

  /** GET /service-listings/me — caller's own listings, paginated. */
  getMine: (params?: ServiceListingsQuery) =>
    apiClient
      .get<ApiResponse<ServiceListing[]>>('/service-listings/me', { params })
      .then((r) => unwrapPaginated<ServiceListing>(r)),

  /** GET /service-listings/:id — public detail. */
  getById: (id: string) =>
    apiClient.get<ApiResponse<ServiceListingWithProvider>>(`/service-listings/${id}`),

  /** POST /service-listings — multipart/form-data, same field-append pattern as ads.api.ts. */
  create: (payload: CreateServiceListingPayload) => {
    const form = new FormData();
    form.append('categoryId', payload.categoryId);
    form.append('title', payload.title);
    form.append('description', payload.description);
    form.append('pricingType', payload.pricingType);
    if (payload.price !== undefined) form.append('price', String(payload.price));
    if (payload.durationEstimate) form.append('durationEstimate', payload.durationEstimate);
    form.append('serviceLocation', payload.serviceLocation);
    payload.images.forEach((file) => form.append('images', file));

    return apiClient.post<ApiResponse<ServiceListing>>('/service-listings', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** PATCH /service-listings/:id — JSON only, no images (see file header). */
  update: (id: string, payload: UpdateServiceListingPayload) =>
    apiClient.patch<ApiResponse<ServiceListing>>(`/service-listings/${id}`, payload),

  /** DELETE /service-listings/:id */
  delete: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/service-listings/${id}`),
};
