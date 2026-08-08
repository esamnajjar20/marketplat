/**
 * Reports API — maps to backend /api/v1/reports/* endpoints.
 *
 * FIX T-03: ReportReason uses backend values: SCAM | FAKE | OFFENSIVE | SPAM.
 * FEAT-REPORT-USER-STORE: added reportUser/reportStore (POST
 * /reports/users/:id, /reports/stores/:id — previously only ads could be
 * reported at all) and getMyReports (GET /reports/me, so a reporter can
 * check the status of what they've filed instead of submitting and never
 * hearing back).
 */
import { apiClient } from './client';
import type { ReportReason, Report } from '@/types/admin.types';
import type { ApiResponse, PaginationParams } from '@/types/api.types';
import { unwrapPaginated } from '@/lib/apiPagination';

export interface CreateReportPayload {
  /** FIX T-03: must be one of SCAM | FAKE | OFFENSIVE | SPAM */
  reason: ReportReason;
  notes?: string;
}

export const reportsApi = {
  /**
   * POST /reports/ads/:adId
   * Creates a report for an ad. Rate-limited at 10 req / 15 min.
   */
  reportAd: (adId: string, payload: CreateReportPayload) =>
    apiClient.post<ApiResponse<null>>(`/reports/ads/${adId}`, payload),

  /**
   * POST /reports/users/:userId
   * FEAT-REPORT-USER-STORE: same rate limit as reportAd (shared
   * reportRateLimit middleware on the backend route).
   */
  reportUser: (userId: string, payload: CreateReportPayload) =>
    apiClient.post<ApiResponse<null>>(`/reports/users/${userId}`, payload),

  /**
   * POST /reports/stores/:storeId
   * FEAT-REPORT-USER-STORE
   */
  reportStore: (storeId: string, payload: CreateReportPayload) =>
    apiClient.post<ApiResponse<null>>(`/reports/stores/${storeId}`, payload),

  /**
   * GET /reports/me — "بلاغاتي": the reports the current user has
   * personally filed, any target type. Not admin-gated — every
   * authenticated user can see their own submissions.
   * Mirrors adminApi.getReports's unwrapPaginated usage: returns the
   * axios response as-is (with `data.data` reshaped to `{ items, meta }`)
   * so a query hook consumes it the same way, via `.then(r => r.data.data)`.
   * FEAT-REPORT-USER-STORE
   */
  getMyReports: (params?: PaginationParams) =>
    apiClient
      .get<ApiResponse<Report[]>>('/reports/me', { params })
      .then((r) => unwrapPaginated<Report>(r)),
};
