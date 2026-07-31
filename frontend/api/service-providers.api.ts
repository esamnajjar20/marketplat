/**
 * Service providers API — maps to backend /api/v1/service-providers/*.
 * Verified against backend-v17's service-providers.routes.ts directly
 * (the plan document's assumed endpoint shape was written before the
 * backend was available and differs in two ways, both reflected here):
 *   - the "my provider" routes are /me (GET/POST/PATCH), same convention
 *     as sellers' /sellers/me/profile, not a bare collection route.
 *   - there is a real GET /service-providers/nearby (lat/lng/radius)
 *     endpoint with no equivalent in the original plan at all.
 */
import { apiClient } from './client';
import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import { unwrapPaginated } from '@/lib/apiPagination';
import type {
  ServiceProviderDetails,
  ServiceProviderPublic,
  CreateServiceProviderPayload,
  UpdateServiceProviderPayload,
  NearbyServiceProvidersParams,
  NearbyServiceProviderRow,
} from '@/types/service.types';

export const serviceProvidersApi = {
  /** POST /service-providers/me — creates the caller's provider profile (once). */
  createMyProvider: (payload: CreateServiceProviderPayload) =>
    apiClient.post<ApiResponse<ServiceProviderDetails>>('/service-providers/me', payload),

  /** GET /service-providers/me — the caller's own provider profile. 404 if none yet. */
  getMyProvider: () =>
    apiClient.get<ApiResponse<ServiceProviderDetails>>('/service-providers/me'),

  /** PATCH /service-providers/me — partial update, including availabilityStatus. */
  updateMyProvider: (payload: UpdateServiceProviderPayload) =>
    apiClient.patch<ApiResponse<ServiceProviderDetails>>('/service-providers/me', payload),

  /** GET /service-providers/:id — public provider page, no auth required. */
  getById: (id: string) =>
    apiClient.get<ApiResponse<ServiceProviderPublic>>(`/service-providers/${id}`),

  /** GET /service-providers/nearby — Haversine search around a lat/lng pin. */
  getNearby: (params: NearbyServiceProvidersParams) =>
    apiClient
      .get<ApiResponse<NearbyServiceProviderRow[]>>('/service-providers/nearby', { params })
      .then((r) => unwrapPaginated<NearbyServiceProviderRow>(r)),
};

// Re-exported for callers that only need the meta type alongside this file.
export type { PaginationMeta };
