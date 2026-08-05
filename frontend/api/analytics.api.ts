/**
 * Admin analytics summary — maps to backend GET /admin/analytics/summary.
 * Unlike lib/analytics.ts (the public event tracker, deliberately not
 * using apiClient — see that file's header), this is an admin-only,
 * authenticated read, so it goes through the normal apiClient like
 * every other admin endpoint (admin.api.ts, auditLogs, etc.).
 */
import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { AnalyticsEventType } from '@/lib/analytics';

export interface AnalyticsTrendPoint {
  bucket: string;
  event: AnalyticsEventType;
  count: number;
}

export interface AnalyticsCategoryCount {
  categoryId: string;
  count: number;
  name: string | null;
  nameAr: string | null;
}

export interface AnalyticsSummary {
  range: { from: string; to: string; bucket: 'day' | 'week' };
  totals: Record<AnalyticsEventType, number>;
  trend: AnalyticsTrendPoint[];
  topCategories: AnalyticsCategoryCount[];
  searchToContact: {
    searchSessions: number;
    contactSessions: number;
    conversionRate: number;
  };
  signupFunnel: {
    startedSessions: number;
    completedSessions: number;
    conversionRate: number;
  };
}

export interface GetAnalyticsSummaryParams {
  from?: string;
  to?: string;
  bucket?: 'day' | 'week';
}

export const analyticsApi = {
  /** GET /admin/analytics/summary */
  getSummary: (params?: GetAnalyticsSummaryParams) =>
    apiClient
      .get<ApiResponse<AnalyticsSummary>>('/admin/analytics/summary', { params })
      .then((r) => r.data.data!),
};
