/**
 * Admin query hooks.
 *
 * FIX Q-01: queryFn now correctly unwraps the nested response.
 *   Backend envelope:  { success, message, data: { items, meta } }
 *   Axios response:    response.data = { success, message, data: { items, meta } }
 *   We must do:        .then(r => r.data.data)  — NOT .then(r => r.data)
 *
 * FIX Q-04: queryKeys use parameterised keys so invalidation works correctly.
 */
'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { adminApi }  from '@/api/admin.api';
import { analyticsApi, type GetAnalyticsSummaryParams } from '@/api/analytics.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { AdminGetAdsParams, AdminGetUsersParams, AdminGetSellersParams, AdminGetStoresParams, AdminGetAuditLogsParams, ReportStatus } from '@/types/admin.types';

/**
 * GET /admin/ads
 * FIX Q-01: .then(r => r.data.data) — unwrap ApiResponse envelope.
 */
export function useAdminAds(params?: AdminGetAdsParams) {
  return useQuery({
    queryKey:        queryKeys.admin.ads(params),
    queryFn:         () => adminApi.getAds(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adminList,
  });
}

/**
 * GET /admin/users
 * FIX Q-01: .then(r => r.data.data)
 */
export function useAdminUsers(params?: AdminGetUsersParams) {
  return useQuery({
    queryKey:        queryKeys.admin.users(params),
    queryFn:         () => adminApi.getUsers(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adminList,
  });
}

/**
 * GET /admin/sellers (Epic 1.1)
 * The report's finding: verify/suspend existed server-side with no way
 * to even list sellers to act on. Mirrors useAdminUsers exactly.
 */
export function useAdminSellers(params?: AdminGetSellersParams) {
  return useQuery({
    queryKey:        queryKeys.admin.sellers(params),
    queryFn:         () => adminApi.getSellers(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adminList,
  });
}

/**
 * GET /admin/stores (audit report issue #1)
 * The report's finding: createStore requires admin approval
 * (PENDING → ACTIVE) but there was no endpoint to list stores by
 * status, so PENDING stores had no discoverable path to approval.
 * Mirrors useAdminSellers exactly.
 */
export function useAdminStores(params?: AdminGetStoresParams) {
  return useQuery({
    queryKey:        queryKeys.admin.stores(params),
    queryFn:         () => adminApi.getStores(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adminList,
  });
}

/**
 * GET /reports (admin)
 * FIX Q-01: .then(r => r.data.data)
 * FIX C-08: adminApi.getReports calls GET /reports (not /admin/reports).
 */
export function useAdminReports(params?: {
  status?: ReportStatus;
  page?:   number;
  limit?:  number;
}) {
  return useQuery({
    queryKey:        queryKeys.admin.reports(params),
    queryFn:         () => adminApi.getReports(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adminList,
  });
}

/** GET /reports/:id — single report detail */
export function useAdminReportDetail(reportId: string) {
  return useQuery({
    queryKey:  queryKeys.admin.reportDetail(reportId),
    queryFn:   () => adminApi.getReportById(reportId).then((r) => r.data.data),
    staleTime: CACHE_TTL.adminList,
    enabled:   Boolean(reportId),
  });
}

/**
 * GET /admin/audit-logs
 * Mirrors useAdminUsers/useAdminSellers exactly — same envelope shape
 * (.then(r => r.data.data)), same placeholderData/staleTime pattern.
 */
export function useAdminAuditLogs(params?: AdminGetAuditLogsParams) {
  return useQuery({
    queryKey:        queryKeys.admin.auditLogs(params),
    queryFn:         () => adminApi.getAuditLogs(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adminList,
  });
}

/**
 * FIX FEAT-05: GET /admin/stats — previously this fired three separate
 * paginated requests (getAds/getUsers/getReports, each with limit=1)
 * just to read each response's meta.total, and still got it wrong:
 * totalAds/activeAds were set to the same value (no way to distinguish
 * them from one total count), same for totalUsers/activeUsers, and
 * viewsToday was hardcoded to 0. Now a single request to a dedicated
 * endpoint that computes each figure correctly server-side.
 */
export function useAdminStats() {
  return useQuery({
    queryKey:  queryKeys.admin.stats(),
    queryFn:   () => adminApi.getStats().then((r) => r.data.data),
    staleTime: CACHE_TTL.adminList,
  });
}

/**
 * Gap #7 (product analytics): GET /admin/analytics/summary — trend,
 * top categories, and search→contact / signup funnel conversion rates
 * for the admin analytics dashboard.
 */
export function useAdminAnalyticsSummary(params?: GetAnalyticsSummaryParams) {
  return useQuery({
    queryKey:  queryKeys.admin.analyticsSummary(params),
    queryFn:   () => analyticsApi.getSummary(params),
    staleTime: CACHE_TTL.adminAnalytics,
  });
}
