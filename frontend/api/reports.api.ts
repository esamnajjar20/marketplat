/**
 * Reports API — maps to backend /api/v1/reports/* endpoints.
 *
 * FIX T-03: ReportReason uses backend values: SCAM | FAKE | OFFENSIVE | SPAM.
 */
import { apiClient } from './client';
import type { ReportReason } from '@/types/admin.types';
import type { ApiResponse }  from '@/types/api.types';

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
};
