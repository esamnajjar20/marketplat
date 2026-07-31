/**
 * Appointments API — maps to backend /api/v1/appointments/*.
 * Verified against appointments.routes.ts:
 *   - GET /availability/:providerId is public (no auth) — customers need
 *     to see open slots before booking anything.
 *   - GET /me returns the CALLER's own appointments as a provider (there
 *     is no customer-side "my appointments" list — Appointment has no
 *     customerId at all, only providerId + optional requestId).
 *   - POST / and PATCH /:id/status are both provider-only from the
 *     service layer's requireOwnProvider guard, same as
 *     service-requests.api.ts's provider-only respond().
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type {
  Appointment,
  AvailabilityResponse,
  CreateAppointmentPayload,
  UpdateAppointmentStatusPayload,
  AppointmentsQuery,
} from '@/types/service.types';

export const appointmentsApi = {
  /** GET /appointments/availability/:providerId?date=YYYY-MM-DD — public. */
  getAvailability: (providerId: string, date: string) =>
    apiClient.get<ApiResponse<AvailabilityResponse>>(
      `/appointments/availability/${providerId}`,
      { params: { date } }
    ),

  /** GET /appointments/me — caller's own appointments as provider, paginated. */
  getMine: (params?: AppointmentsQuery) =>
    apiClient
      .get<ApiResponse<Appointment[]>>('/appointments/me', { params })
      .then((r) => unwrapPaginated<Appointment>(r)),

  /** POST /appointments — provider books a slot, optionally against a request. */
  create: (payload: CreateAppointmentPayload) =>
    apiClient.post<ApiResponse<Appointment>>('/appointments', payload),

  /** PATCH /appointments/:id/status — COMPLETED | CANCELLED | NO_SHOW only. */
  updateStatus: (id: string, payload: UpdateAppointmentStatusPayload) =>
    apiClient.patch<ApiResponse<Appointment>>(`/appointments/${id}/status`, payload),
};
