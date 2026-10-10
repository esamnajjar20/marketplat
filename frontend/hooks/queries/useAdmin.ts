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
// FIX ADMIN-HOOKS-KEYS-ONLY-01: applying only the parts of the earlier
// 1f583d0 commit that were correct -- queryKeys.admin.* replacements
// (they make mutation-driven invalidation actually match) plus removal
// of dead `?? 30_000` / `?? 120_000` fallbacks and the missing
// staleTime/placeholderData on useAdminOpenRequests. The four
// `.then((r) => r.data)` envelope-passing hooks are LEFT AS-IS -- this
// project's list hooks are NOT uniform about unwrapping ApiResponse.
// Confirmed via AdminProductsTable, AdminServiceListingsTable and
// AdminOpenRequestsTable, all of which read `data.data` (the envelope)
// from the hook result. Same lesson as useRequests.
'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { adminApi }  from '@/api/admin.api';
import { analyticsApi, type GetAnalyticsSummaryParams } from '@/api/analytics.api';
import { queryKeys } from '@/lib/queryKeys';
import { pollingInterval } from '@/lib/polling';
import { CACHE_TTL } from '@/lib/constants';
import type { AdminGetAdsParams, AdminGetUsersParams, AdminGetSellersParams, AdminGetStoresParams, AdminGetAuditLogsParams, AdminGetFlaggedAdsParams, AdminGetFraudSignalsParams } from '@/types/admin.types';

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

export function useAdminStoreTypes() {
  return useQuery({
    queryKey: queryKeys.admin.storeTypes(),
    queryFn: () => adminApi.getStoreTypes().then((r) => r.data.data),
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * GET /reports (admin)
 * FIX Q-01: .then(r => r.data.data)
 * FIX C-08: adminApi.getReports calls GET /reports (not /admin/reports).
 */
export function useAdminReports(
  params?: Parameters<typeof adminApi.getReports>[0],
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:        queryKeys.admin.reports(params),
    queryFn:         () => adminApi.getReports(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adminList,
    enabled:         options?.enabled ?? true,
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
/** GET /admin/ops-queue — work items needing action (badges + dashboard). */
export function useAdminOpsQueue() {
  return useQuery({
    queryKey: queryKeys.admin.opsQueue(),
    queryFn: () => adminApi.getOpsQueue().then((r) => r.data.data),
    staleTime: CACHE_TTL.adminList,
    // Respect visibility/online policy: do not poll admin counters in a
    // hidden tab or while offline. These are operational summaries, not
    // a real-time transport, so the regular 60s cadence is sufficient.
    refetchInterval: () => pollingInterval(60_000, 1),
  });
}

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
/**
 * GET /admin/fraud/ads — flagged-ad review queue, highest riskScore
 * first (see fraud.repository.ts's findFlaggedAds orderBy). Mirrors
 * useAdminReports exactly, same envelope-unwrap/placeholderData/
 * staleTime pattern.
 */
export function useAdminFlaggedAds(params?: AdminGetFlaggedAdsParams) {
  return useQuery({
    queryKey:        queryKeys.admin.fraudAds(params),
    queryFn:         () => adminApi.getFlaggedAds(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adminList,
  });
}

/** GET /admin/fraud/signals — raw signal log for one ad (drives the detail drawer). */
export function useAdminFraudSignals(params?: AdminGetFraudSignalsParams) {
  return useQuery({
    queryKey:        queryKeys.admin.fraudSignals(params),
    queryFn:         () => adminApi.getFraudSignals(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adminList,
    // Signals are fetched per-ad (params.adId) from an expandable row —
    // no point issuing the request before an ad is actually expanded.
    enabled:         Boolean(params?.adId),
  });
}

export function useAdminAnalyticsSummary(params?: GetAnalyticsSummaryParams) {
  return useQuery({
    queryKey:  queryKeys.admin.analyticsSummary(params),
    queryFn:   () => analyticsApi.getSummary(params),
    staleTime: CACHE_TTL.adminAnalytics,
  });
}

export function useAdminProducts(params?: Parameters<typeof adminApi.getAdminProducts>[0]) {
  return useQuery({
    queryKey: queryKeys.admin.products(params),
    queryFn: () => adminApi.getAdminProducts(params).then((r) => r.data),
    staleTime: CACHE_TTL.adminList,
    placeholderData: keepPreviousData,
  });
}

export function useAdminServiceListings(params?: Parameters<typeof adminApi.getAdminServiceListings>[0]) {
  return useQuery({
    queryKey: queryKeys.admin.serviceListings(params),
    queryFn: () => adminApi.getAdminServiceListings(params).then((r) => r.data),
    staleTime: CACHE_TTL.adminList,
    placeholderData: keepPreviousData,
  });
}

export function useAdminServiceRequestDisputes(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.admin.serviceRequestDisputes(params),
    queryFn: () => adminApi.getServiceRequestDisputes(params).then((r) => r.data),
    staleTime: CACHE_TTL.adminList,
    placeholderData: keepPreviousData,
  });
}

export function useAdminOpenRequests(params?: Parameters<typeof adminApi.getAdminOpenRequests>[0]) {
  return useQuery({
    queryKey: queryKeys.admin.openRequests(params),
    queryFn: () => adminApi.getAdminOpenRequests(params).then((r) => r.data),
    staleTime: CACHE_TTL.adminList,
    placeholderData: keepPreviousData,
  });
}

export function useAdminPlatformTrends(days = 30) {
  return useQuery({
    queryKey: queryKeys.admin.trends(days),
    queryFn: () => adminApi.getPlatformTrends(days).then((r) => r.data.data),
    staleTime: CACHE_TTL.adminAnalytics,
  });
}

export function useAdminSystemHealth() {
  return useQuery({
    queryKey: queryKeys.admin.systemHealth(),
    queryFn: () => adminApi.getSystemHealth().then((r) => r.data.data),
    staleTime: CACHE_TTL.adminList,
    // Respect visibility/online policy: do not poll admin counters in a
    // hidden tab or while offline. These are operational summaries, not
    // a real-time transport, so the regular 60s cadence is sufficient.
    refetchInterval: () => pollingInterval(60_000, 1),
  });
}

export function useAdminStoreTypeFields(storeTypeId?: string) {
  return useQuery({
    queryKey: queryKeys.storeTypes.fields(`admin:${storeTypeId ?? ''}`),
    queryFn: () => adminApi.getStoreTypeFields(storeTypeId!).then((r) => r.data.data),
    enabled: Boolean(storeTypeId),
    staleTime: 5 * 60 * 1000,
  });
}
