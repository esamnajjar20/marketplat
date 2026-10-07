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
  AssignableRole,
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
  UpdateStorePlanPayload,
  UpdateStoreTypePayload,
  AdminStoreType,
  CreateAdminStoreTypePayload,
  UpdateAdminStoreTypePayload,
  BroadcastNotificationPayload,
  BroadcastNotificationResult,
  AuditLog,
  AdminGetAuditLogsParams,
  BulkActionMeta,
  FlaggedAd,
  FraudSignal,
  AdminGetFlaggedAdsParams,
  AdminGetFraudSignalsParams,
  ManualFraudFlagPayload,
} from '@/types/admin.types';
import type { ApiResponse } from '@/types/api.types';

/**
 * FIX ADMIN-API-TYPING-01: platform-trends response shape (admin.api.ts's
 * getPlatformTrends). Consumers read `.series` directly off the envelope
 * (see AdminPlatformTrends.tsx's own typed local), so the field must be
 * a real property, not an index-signature lookup. The index signature
 * is kept so any future field is still readable without a cast — the
 * trade-off being that a typo on an undefined key reads as unknown
 * rather than erroring.
 */
export interface AdminPlatformTrendsResponse {
  series?: Array<{ date: string; users: number; ads: number; reports: number }>;
  [key: string]: unknown;
}

/**
 * FIX ADMIN-API-TYPING-01: system-health response shape (admin.api.ts's
 * getSystemHealth). checkedAt is the only field the component reads
 * without a cast (AdminSystemHealth.tsx line 73 uses it in a Date
 * constructor). redis and db are cast by the component itself, so
 * they stay unknown here.
 */
export interface AdminSystemHealthResponse {
  checkedAt?: string;
  redis?: unknown;
  db?: unknown;
  [key: string]: unknown;
}

/** BULK-ADMIN (item 17): shared response shape every bulk endpoint
 * below returns — see admin.types.ts's BulkActionMeta doc comment. */
type BulkApiResponse<T> = Omit<ApiResponse<T[]>, 'data'> & { data: T[]; meta: BulkActionMeta };

export const adminApi = {
  /**
   * FIX FEAT-05: GET /admin/stats — replaces the previous client-side
   * workaround of firing getAds/getUsers/getReports with limit=1 just
   * to read each response's meta.total.
   */
  
  // FIX ADMIN-API-TYPING-01: explicit ApiResponse<unknown[]>. The
  // controller wraps the items array in successResponse(...) with a
  // separate meta.pagination field (see admin.controller.ts:50-52),
  // and the consumer (AdminProductsTable) reads data.data directly
  // as the envelope — same pattern as the other paginated admin
  // lists. unknown[] is honest about the element shape (Product is
  // not exported from the frontend types yet) while still giving
  // Array.isArray(data.data) meaning.
  getAdminProducts: (params?: { page?: number; limit?: number; status?: string; q?: string }) =>
    apiClient.get<ApiResponse<unknown[]>>('/admin/products', { params }),

  // FIX ADMIN-API-TYPING-01: explicit ApiResponse<unknown> instead of
  // the implicit `any` — the write response body is not read by any
  // current caller, and unknown documents that fact without
  // pretending to know the shape. When a caller eventually needs to
  // read the updated row, swap in the real type (see useAdminSetProduct
  // Status's onSuccess, which currently only invalidates the list).
  setProductStatus: (id: string, body: { status: string; reason?: string }) =>
    apiClient.patch<ApiResponse<unknown>>(`/admin/products/${id}/status`, body),

  // FIX ADMIN-API-TYPING-01: see getAdminProducts above.
  getAdminServiceListings: (params?: { page?: number; limit?: number; status?: string; q?: string }) =>
    apiClient.get<ApiResponse<unknown[]>>('/admin/service-listings', { params }),

  // FIX ADMIN-API-TYPING-01: see setProductStatus above.
  setServiceListingStatus: (id: string, body: { status: string; reason?: string }) =>
    apiClient.patch<ApiResponse<unknown>>(`/admin/service-listings/${id}/status`, body),


  getServiceRequestDisputes: (params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<unknown[]>>('/admin/service-request-disputes', { params }),

  resolveServiceRequestDispute: (id: string, body: { resolution: 'COMPLETED' | 'CANCELLED'; note?: string }) =>
    apiClient.patch<ApiResponse<unknown>>(`/admin/service-request-disputes/${id}/resolve`, body),

  // FIX ADMIN-API-TYPING-01: see getAdminProducts above.
  getAdminOpenRequests: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    q?: string;
  }) => apiClient.get<ApiResponse<unknown[]>>('/admin/open-requests', { params }),

  // FIX ADMIN-API-TYPING-01: see setProductStatus above.
  cancelOpenRequest: (id: string, body?: { reason?: string }) =>
    apiClient.patch<ApiResponse<unknown>>(`/admin/open-requests/${id}/cancel`, body ?? {}),

  // FIX ADMIN-API-TYPING-01: single-object response, no items/meta
  // wrapper. Type is defined above (AdminPlatformTrendsResponse)
  // so the .series read in AdminPlatformTrends.tsx is typed end to
  // end; the index signature keeps any future field readable.
  getPlatformTrends: (days?: number) =>
    apiClient.get<ApiResponse<AdminPlatformTrendsResponse>>('/admin/trends', { params: { days } }),

  // FIX ADMIN-API-TYPING-01: type defined above (AdminSystemHealthResponse).
  getSystemHealth: () =>
    apiClient.get<ApiResponse<AdminSystemHealthResponse>>('/admin/system-health'),

  // FIX ADMIN-API-TYPING-01: typed as Blob — axios with responseType
  // 'blob' resolves with an actual Blob in .data, and TS otherwise
  // widens to `any`. Consumers do `new Blob([response.data])` (or
  // pass response.data straight to a URL.createObjectURL call) and
  // silently accepted `any` before; now the type is honest.
  exportUsersCsv: () =>
    apiClient.get<Blob>('/admin/export/users.csv', { responseType: 'blob' }),

  // FIX ADMIN-API-TYPING-01: see exportUsersCsv above.
  exportReportsCsv: () =>
    apiClient.get<Blob>('/admin/export/reports.csv', { responseType: 'blob' }),

  // FIX ADMIN-API-TYPING-01: see getPlatformTrends above.

  getOpsQueue: () =>
    apiClient.get<
      ApiResponse<{
        openReports: number;
        pendingStores: number;
        pendingSellers: number;
        unreviewedFraud: number;
        total: number;
      }>
    >('/admin/ops-queue'),

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

  // BULK-ADMIN (item 17): backend PATCH /admin/ads/bulk/featured,
  // PATCH /admin/ads/bulk/pinned, DELETE /admin/ads/bulk.
  bulkSetFeatured: (adIds: string[], isFeatured: boolean) =>
    apiClient.patch<BulkApiResponse<AdminAd>>('/admin/ads/bulk/featured', { adIds, isFeatured }),

  bulkSetPinned: (adIds: string[], isPinned: boolean) =>
    apiClient.patch<BulkApiResponse<AdminAd>>('/admin/ads/bulk/pinned', { adIds, isPinned }),

  bulkDeleteAds: (adIds: string[]) =>
    apiClient.delete<BulkApiResponse<string>>('/admin/ads/bulk', { data: { adIds } }),

  // ── Users ─────────────────────────────────────────────────────────

  getUsers: (params?: AdminGetUsersParams) =>
    apiClient
      .get<ApiResponse<AdminUser[]>>('/admin/users', { params })
      .then((r) => unwrapPaginated<AdminUser>(r)),

  toggleUserActive: (userId: string, payload: ToggleActivePayload) =>
    apiClient.patch<ApiResponse<AdminUser>>(`/admin/users/${userId}/active`, payload),

  // BULK-ADMIN (item 17): active/inactive only — role changes are
  // deliberately not batched (see AdminUsersTable.tsx / admin.routes.ts
  // comments on why).
  bulkToggleUserActive: (userIds: string[], isActive: boolean) =>
    apiClient.patch<BulkApiResponse<AdminUser>>('/admin/users/bulk/active', { userIds, isActive }),

  /** FIX AUDIT-V3-05 / Gap #20 (admin permission tiers): PATCH
   * /admin/users/:id/role. role is AssignableRole (USER/MODERATOR/
   * ADMIN) — SUPER_ADMIN is never sent from here, matching the
   * backend's assignableRoleSchema which rejects it outright. */
  changeRole: (userId: string, role: AssignableRole) =>
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

  // BULK-ADMIN (item 17): backend PATCH /admin/sellers/bulk/verify,
  // PATCH /admin/sellers/bulk/suspend.
  bulkSetSellerVerified: (sellerProfileIds: string[], verified: boolean) =>
    apiClient.patch<BulkApiResponse<AdminSeller>>('/admin/sellers/bulk/verify', {
      sellerProfileIds,
      verified,
    }),

  bulkSetSellerSuspended: (sellerProfileIds: string[], suspended: boolean, reason?: string) =>
    apiClient.patch<BulkApiResponse<AdminSeller>>('/admin/sellers/bulk/suspend', {
      sellerProfileIds,
      suspended,
      reason,
    }),

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

  // BULK-ADMIN (item 17): backend PATCH /admin/stores/bulk/status.
  bulkUpdateStoreStatus: (storeIds: string[], status: UpdateStoreStatusPayload['status'], reason?: string) =>
    apiClient.patch<BulkApiResponse<AdminStore>>('/admin/stores/bulk/status', { storeIds, status, reason }),

  // FIX BUG-02: StorePlan.FEATURED was rendered across the store UI
  // (StoreHeader/StoreCard/MyStoreCard/FeaturedStoresSection) but no
  // endpoint ever set it — this wires the frontend to the new
  // PATCH /admin/stores/:id/plan route.
  updateStorePlan: (storeId: string, payload: UpdateStorePlanPayload) =>
    apiClient.patch<ApiResponse<AdminStore>>(`/admin/stores/${storeId}/plan`, payload),

  updateStoreType: (storeId: string, payload: UpdateStoreTypePayload) =>
    apiClient.patch<ApiResponse<AdminStore>>(`/admin/stores/${storeId}/type`, payload),

  getStoreTypes: () =>
    apiClient.get<ApiResponse<AdminStoreType[]>>('/admin/store-types'),

  createStoreType: (payload: CreateAdminStoreTypePayload) =>
    apiClient.post<ApiResponse<AdminStoreType>>('/admin/store-types', payload),

  updateStoreTypeDefinition: (id: string, payload: UpdateAdminStoreTypePayload) =>
    apiClient.patch<ApiResponse<AdminStoreType>>(`/admin/store-types/${id}`, payload),

  updateStoreTypeStatus: (id: string, isActive: boolean) =>
    apiClient.patch<ApiResponse<AdminStoreType>>(`/admin/store-types/${id}/status`, { isActive }),

  getStoreTypeFields: (storeTypeId: string) =>
    apiClient.get<ApiResponse<import('@/types/store.types').StoreTypeField[]>>(`/admin/store-types/${storeTypeId}/fields`),
  createStoreTypeField: (storeTypeId: string, payload: import('@/types/admin.types').CreateStoreTypeFieldPayload) =>
    apiClient.post<ApiResponse<import('@/types/store.types').StoreTypeField>>(`/admin/store-types/${storeTypeId}/fields`, payload),
  updateStoreTypeField: (storeTypeId: string, fieldId: string, payload: import('@/types/admin.types').UpdateStoreTypeFieldPayload) =>
    apiClient.patch<ApiResponse<import('@/types/store.types').StoreTypeField>>(`/admin/store-types/${storeTypeId}/fields/${fieldId}`, payload),

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

  // BULK-ADMIN (item 17): backend PATCH /reports/bulk/status. `data` on
  // the response is the updated reports; `meta.updatedCount`/`meta.failed`
  // carry the per-id outcome (best-effort batch, not all-or-nothing —
  // see reports.service.ts's bulkUpdateReportStatus).
  bulkUpdateReportStatus: (
    reportIds: string[],
    status: Extract<ReportStatus, 'RESOLVED' | 'DISMISSED'>,
  ) => apiClient.patch<BulkApiResponse<Report>>('/reports/bulk/status', { reportIds, status }),

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

  // ── Fraud detection ──────────────────────────────────────────────
  // Backend: /admin/fraud/* (fraud.routes.ts, MODERATOR tier+). The
  // module (service/repository/controller/routes/tests) shipped fully
  // wired server-side with no frontend caller at all — riskScore and
  // flaggedForReview were computed and persisted on every ad with no
  // reachable screen to review them from.

  getFlaggedAds: (params?: AdminGetFlaggedAdsParams) =>
    apiClient
      .get<ApiResponse<FlaggedAd[]>>('/admin/fraud/ads', { params })
      .then((r) => unwrapPaginated<FlaggedAd>(r)),

  clearAdFraudFlag: (adId: string) =>
    apiClient.patch<ApiResponse<null>>(`/admin/fraud/ads/${adId}/clear`),

  manualFraudFlag: (adId: string, payload: ManualFraudFlagPayload) =>
    apiClient.post<ApiResponse<null>>(`/admin/fraud/ads/${adId}/flag`, payload),

  getFraudSignals: (params?: AdminGetFraudSignalsParams) =>
    apiClient
      .get<ApiResponse<FraudSignal[]>>('/admin/fraud/signals', { params })
      .then((r) => unwrapPaginated<FraudSignal>(r)),

  reviewFraudSignal: (signalId: string) =>
    apiClient.patch<ApiResponse<FraudSignal>>(`/admin/fraud/signals/${signalId}/review`),
};
