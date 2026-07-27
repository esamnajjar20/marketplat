/**
 * Service requests API — maps to backend /api/v1/service-requests/*.
 * Verified against service-requests.routes.ts:
 *   - "my requests as customer" is GET /me, "incoming as provider" is
 *     GET /incoming — two distinct routes, not one route with a
 *     `scope` query param as the original plan sketched.
 *   - There is one PATCH /:id/respond endpoint driven by an `action`
 *     enum (ACCEPTED/REJECTED/IN_PROGRESS/COMPLETED/CANCELLED), not
 *     separate accept/reject endpoints.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type {
  ServiceRequest,
  CreateServiceRequestPayload,
  RespondToServiceRequestPayload,
  ServiceRequestsQuery,
} from '@/types/service.types';

export const serviceRequestsApi = {
  /** POST /service-requests */
  create: (payload: CreateServiceRequestPayload) =>
    apiClient.post<ApiResponse<ServiceRequest>>('/service-requests', payload),

  /** GET /service-requests/:id */
  getById: (id: string) =>
    apiClient.get<ApiResponse<ServiceRequest>>(`/service-requests/${id}`),

  /** GET /service-requests/me — caller's requests as customer, paginated. */
  getMineAsCustomer: (params?: ServiceRequestsQuery) =>
    apiClient
      .get<ApiResponse<ServiceRequest[]>>('/service-requests/me', { params })
      .then((r) => unwrapPaginated<ServiceRequest>(r)),

  /** GET /service-requests/incoming — caller's requests as provider, paginated. */
  getIncomingAsProvider: (params?: ServiceRequestsQuery) =>
    apiClient
      .get<ApiResponse<ServiceRequest[]>>('/service-requests/incoming', { params })
      .then((r) => unwrapPaginated<ServiceRequest>(r)),

  /** PATCH /service-requests/:id/respond — action-driven state transition. */
  respond: (id: string, payload: RespondToServiceRequestPayload) =>
    apiClient.patch<ApiResponse<ServiceRequest>>(`/service-requests/${id}/respond`, payload),
};
