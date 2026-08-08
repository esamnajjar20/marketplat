/**
 * Admin API — maps to backend /api/v1/admin/* and /api/v1/reports/* endpoints.
 *
 * FIX C-08: updateReportStatus now calls PATCH /reports/:id/status
 *           (was incorrectly PATCH /admin/reports/:id).
 *           Backend route: PATCH /reports/:id/status in reportsRouter.
 *
 * FIX T-03: ReportStatus uses 'RESOLVED' (not 'REVIEWED').
 *           Backend Prisma enum: PENDING | RESOLVED | DISMISSED.
 *
 * FIX API-SHAPE-01: getAds/getUsers/getReports now unwrap the backend's
 *   real response shape via unwrapPaginated — see lib/apiPagination.ts.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type {
  AdminUser,
  AdminAd,
  AdminGetAdsParams,
  AdminGetUsersParams,
  SetFeaturedPayload,
  SetPinnedPayload,
  ToggleActivePayload,
  Report,
  ReportStatus,
  ReportTargetType,
  AdminStats,
  AdminSeller,
  AdminGetSellersParams,
  SetSellerVerifiedPayload,
  SetSellerSuspendedPayload,
  AdminStore,
  AdminGetStoresParams,
  UpdateStoreStatusPayload,
  BroadcastNotificationPayload,
  BroadcastNotificationResult,
  AuditLog,
  AdminGetAuditLogsParams,
} from '@/types/admin.types';
import type { ApiResponse } from '@/types/api.types';

export const adminApi = {
  /**
   * FIX FEAT-05: GET /admin/stats — replaces the previous client-side
   * workaround of firing getAds/getUsers/getReports with limit=1 just
   * to read each response's meta.total.
   */
  getStats: () =>
    apiClient.get<ApiResponse<AdminStats>>('/admin/stats'),

  // ── Ads ──────────────────────────────────────────────────────────

  getAds: (params?: AdminGetAdsParams) =>
    apiClient
      .get<ApiResponse<AdminAd[]>>('/admin/ads', { params })
      .then((r) => unwrapPaginated<AdminAd>(r)),

  setFeatured: (adId: string, payload: SetFeaturedPayload) =>
    apiClient.patch<ApiResponse<AdminAd>>(`/admin/ads/${adId}/featured`, payload),

  setPinned: (adId: string, payload: SetPinnedPayload) =>
    apiClient.patch<ApiResponse<AdminAd>>(`/admin/ads/${adId}/pinned`, payload),

  forceDeleteAd: (adId: string) =>
    apiClient.delete<ApiResponse<null>>(`/admin/ads/${adId}`),

  // ── Users ─────────────────────────────────────────────────────────

  getUsers: (params?: AdminGetUsersParams) =>
    apiClient
      .get<ApiResponse<AdminUser[]>>('/admin/users', { params })
      .then((r) => unwrapPaginated<AdminUser>(r)),

  toggleUserActive: (userId: string, payload: ToggleActivePayload) =>
    apiClient.patch<ApiResponse<AdminUser>>(`/admin/users/${userId}/active`, payload),

  /** FIX AUDIT-V3-05: PATCH /admin/users/:id/role */
  changeRole: (userId: string, role: 'USER' | 'ADMIN') =>
    apiClient.patch<ApiResponse<AdminUser>>(`/admin/users/${userId}/role`, { role }),

  // ── Sellers (Epic 1.1) ───────────────────────────────────────────
  // The report's finding: verifySeller/suspendSeller existed on the
  // backend with zero reachable UI — no way to even list sellers to
  // act on. GET /admin/sellers, PATCH /admin/sellers/:id/verify, and
  // PATCH /admin/sellers/:id/suspend now all exist server-side
  // (admin.routes.ts) — this wires the frontend to them.

  getSellers: (params?: AdminGetSellersParams) =>
    apiClient
      .get<ApiResponse<AdminSeller[]>>('/admin/sellers', { params })
      .then((r) => unwrapPaginated<AdminSeller>(r)),

  setSellerVerified: (sellerProfileId: string, payload: SetSellerVerifiedPayload) =>
    apiClient.patch<ApiResponse<AdminSeller>>(`/admin/sellers/${sellerProfileId}/verify`, payload),

  setSellerSuspended: (sellerProfileId: string, payload: SetSellerSuspendedPayload) =>
    apiClient.patch<ApiResponse<AdminSeller>>(`/admin/sellers/${sellerProfileId}/suspend`, payload),

  // ── Stores (audit report issue #1) ───────────────────────────────
  // The report's finding: createStore requires admin approval but
  // GET /stores is public and hardcoded to status=ACTIVE only, so a
  // PENDING store had no endpoint to even be listed for approval.
  // GET /admin/stores and PATCH /admin/stores/:id/status now exist
  // server-side (admin.routes.ts) — this wires the frontend to them.

  getStores: (params?: AdminGetStoresParams) =>
    apiClient
      .get<ApiResponse<AdminStore[]>>('/admin/stores', { params })
      .then((r) => unwrapPaginated<AdminStore>(r)),

  updateStoreStatus: (storeId: string, payload: UpdateStoreStatusPayload) =>
    apiClient.patch<ApiResponse<AdminStore>>(`/admin/stores/${storeId}/status`, payload),

  // ── Reports (routes in /reports — NOT /admin/reports) ─────────────

  getReports: (params?: {
    status?: ReportStatus;
    targetType?: ReportTargetType;
    page?: number;
    limit?: number;
  }) =>
    apiClient
      .get<ApiResponse<Report[]>>('/reports', { params })
      .then((r) => unwrapPaginated<Report>(r)),

  getReportById: (reportId: string) =>
    apiClient.get<ApiResponse<Report>>(`/reports/${reportId}`),

  /**
   * FIX C-08: Backend route is PATCH /reports/:id/status (in reportsRouter).
   * FIX T-03: status is 'RESOLVED' | 'DISMISSED' (not 'REVIEWED').
   */
  updateReportStatus: (reportId: string, status: Extract<ReportStatus, 'RESOLVED' | 'DISMISSED'>) =>
    apiClient.patch<ApiResponse<Report>>(`/reports/${reportId}/status`, { status }),

  // ── Notifications ────────────────────────────────────────────────
  // Backend: POST /admin/notifications/broadcast. Existed fully
  // server-side (controller/service/validation) with no frontend
  // caller at all — this wires it up.

  broadcastNotification: (payload: BroadcastNotificationPayload) =>
    apiClient.post<ApiResponse<BroadcastNotificationResult>>(
      '/admin/notifications/broadcast',
      payload,
    ),

  // ── Audit logs ────────────────────────────────────────────────────
  // Backend: GET /admin/audit-logs (own module — see backend
  // src/modules/audit-logs). Admin-only, same guard pattern as every
  // other /admin/* route.

  getAuditLogs: (params?: AdminGetAuditLogsParams) =>
    apiClient
      .get<ApiResponse<AuditLog[]>>('/admin/audit-logs', { params })
      .then((r) => unwrapPaginated<AuditLog>(r)),
};
