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
import type { ApiResponse } from '@/types/api.types';
import type { AxiosRequestConfig } from 'axios';
import { unwrapPaginated } from '@/lib/apiPagination';
import type {
  ServiceProviderDetails,
  PublicServiceProviderSummary,
  ServiceProviderPublic,
  ServiceProviderAnalytics,
  CreateServiceProviderPayload,
  UpdateServiceProviderPayload,
  ServiceProvidersQuery,
  NearbyServiceProvidersParams,
  NearbyServiceProviderRow,
  ServiceProviderServiceTypeProfile,
} from '@/types/service.types';

export const serviceProvidersApi = {
  /**
   * Phase 3: GET /service-providers — public city/browse directory,
   * paginated. Same unwrapPaginated convention as storesApi.getAll/
   * productsApi.getAll. city optional — omitted means general/unfiltered.
   */
  getAll: (params?: ServiceProvidersQuery, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<PublicServiceProviderSummary[]>>('/service-providers', { ...config, params })
      .then((r) => unwrapPaginated<PublicServiceProviderSummary>(r)),

  /** POST /service-providers/me — creates the caller's provider profile (once). */
  createMyProvider: (payload: CreateServiceProviderPayload) =>
    apiClient.post<ApiResponse<ServiceProviderDetails>>('/service-providers/me', payload),

  /** GET /service-providers/me — the caller's own provider profile. 404 if none yet. */
  getMyProvider: (config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<ServiceProviderDetails>>('/service-providers/me', config),

  /** PATCH /service-providers/me — partial update, including availabilityStatus. */
  updateMyProvider: (payload: UpdateServiceProviderPayload) =>
    apiClient.patch<ApiResponse<ServiceProviderDetails>>('/service-providers/me', payload),

  /** GET /service-providers/me/service-types — provider-specific dynamic fields by service type. */
  getMyServiceTypeProfiles: (config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<ServiceProviderServiceTypeProfile[]>>('/service-providers/me/service-types', config),

  /** PATCH /service-providers/me/service-types/:serviceTypeId — update provider attributes for one service type. */
  updateMyServiceTypeProfile: (serviceTypeId: string, payload: { attributes: Record<string, unknown>; isActive?: boolean }) =>
    apiClient.patch<ApiResponse<ServiceProviderServiceTypeProfile>>(`/service-providers/me/service-types/${serviceTypeId}`, payload),

  /** GET /service-providers/me/analytics — owner-only dashboard. */
  getMyAnalytics: (period: '7d' | '30d' | 'all' = 'all', config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<ServiceProviderAnalytics>>('/service-providers/me/analytics', {
      ...config,
      params: { period },
    }),

  /** POST /service-providers/me/logo — multipart upload, same shape as storesApi.uploadLogo. */
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('image', file);
    // FIX MULTIPART-BOUNDARY-01: see api/users.api.ts's comment.
    return apiClient.post<ApiResponse<ServiceProviderDetails>>('/service-providers/me/logo', form);
  },

  /** GET /service-providers/:id — public provider page, no auth required. */
  getById: (id: string, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<ServiceProviderPublic>>(`/service-providers/${id}`, config),

  /** GET /service-providers/nearby — Haversine search around a lat/lng pin. */
  getNearby: (params: NearbyServiceProvidersParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<NearbyServiceProviderRow[]>>('/service-providers/nearby', { ...config, params })
      .then((r) => unwrapPaginated<NearbyServiceProviderRow>(r)),
};

