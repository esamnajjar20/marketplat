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
  FraudMonitorScanReport,
  FraudMonitorHistoryResponse,
  AdminGetFlaggedAdsParams,
  AdminGetFraudSignalsParams,
  ManualFraudFlagPayload,
} from '@/types/admin.types';
import type { ApiResponse } from '@/types/api.types';
import type { AxiosRequestConfig } from 'axios';

/**
 * FIX ADMIN-API-TYPING-01: platform-trends response shape (admin.api.ts's
 * getPlatformTrends). Consumers read `.series` directly off the envelope
 * (see AdminPlatformTrends.tsx's own typed local), so the field must be
 * a real property, not an index-signature lookup. The index signature
 * is kept so any future field is still readable without a cast — the
 * trade-off being that a typo on an undefined key reads as unknown
 * rather than erroring.
 */
/**
 * Validate simulator API payloads so consumers receive non-optional data.
 */
function requireUserSimulatorData<T>(
  value: T | null | undefined,
  endpoint: string
): T {
  if (value === null || value === undefined) {
    throw new Error(`استجابة محاكي المستخدمين فارغة: ${endpoint}`);
  }
  return value;
}

export interface UserSimulatorConfig {
  targetUrl: string;
  virtualUsers: number;
  browserConcurrency: number;
  rampUpMs: number;
  thinkTimeMs: number;
  iterations: number;
  actionTimeoutMs: number;
  viewport: 'desktop' | 'mobile';
  stopOnFailure: boolean;
  defaultAllowWrites: boolean;
  allowedHosts: string[];
  hardMaxUsers: number;
  hardMaxConcurrency: number;
  hardMaxWriteUsers: number;
  registrationConfigured: boolean;
  testAccountsConfigured: boolean;
  testAccountCount: number;
  testAccountRoleCounts: { buyer: number; seller: number; any: number };
  seedAdConfigured: boolean;
  seedSellerConfigured: boolean;
  seedProductConfigured: boolean;
  seedServiceConfigured: boolean;
}

export interface UserSimulatorScenario {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  writes: boolean;
  requiresAccount: boolean;
  accountRole?: 'buyer' | 'seller';
  requiresSeedAd?: boolean;
  requiresSeedSeller?: boolean;
  requiresSeedProduct?: boolean;
  requiresSeedService?: boolean;
  tags: string[];
  steps: Array<Record<string, unknown>>;
}

export interface UserSimulatorRunSummary {
  usersTotal: number;
  usersStarted: number;
  usersCompleted: number;
  usersFailed: number;
  stepsTotal: number;
  stepsPassed: number;
  stepsFailed: number;
  httpRequests: number;
  httpErrors: number;
  consoleErrors: number;
  pageErrors: number;
  averagePageLoadMs: number | null;
  p95PageLoadMs: number | null;
  averageLcpMs: number | null;
  p95LcpMs: number | null;
  averageApiDurationMs: number | null;
  p95ApiDurationMs: number | null;
  durationMs: number;
}

export interface UserSimulatorRun {
  id: string;
  status: 'queued' | 'running' | 'stopping' | 'stopped' | 'completed' | 'completed_with_errors' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  options: Record<string, unknown>;
  summary: UserSimulatorRunSummary;
  users: Array<Record<string, unknown>>;
  operations: Array<Record<string, unknown>>;
  apiRequests: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
}

export interface AdminPlatformTrendsResponse {
  series?: Array<{ date: string; users: number; ads: number; reports: number }>;
  [key: string]: unknown;
}

/**
 * Shape returned by the protected admin system-health endpoint. Runtime
 * fields are intentionally limited to safe operational facts; secrets,
 * environment variables, and request payloads are not returned.
 */
export interface DeveloperToolsSetting {
  enabled: boolean;
  updatedAt: string | null;
  backendDevelopmentMode: boolean;
}

export interface AdminMonitoringEvent {
  id: string;
  timestamp: string;
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  kind: 'http-error' | 'slow-request';
  errorCode?: string;
}

export interface AdminMonitoringAlert {
  id: string;
  title: string;
  severity: 'warning' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved';
  description: string;
  value: number;
  threshold: number;
  firstSeenAt: string;
  updatedAt: string;
}

export interface AdminMonitoringSample {
  timestamp: string;
  requests: number;
  errors: number;
  serverErrors: number;
  averageDurationMs: number;
  rssBytes: number;
  heapUsedBytes: number;
}

export interface AdminDataIntegritySample {
  id: string;
  [key: string]: unknown;
}

export interface AdminDataIntegrityCheck {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  entityType: string;
  count: number;
  samples: AdminDataIntegritySample[];
}

export interface AdminDataIntegrityReport {
  mode: 'read_only';
  scannedAt: string;
  durationMillis: number;
  checkCount: number;
  findingCount: number;
  bySeverity: { critical: number; warning: number; info: number };
  checks: AdminDataIntegrityCheck[];
}

export interface AdminSystemHealthResponse {
  checkedAt?: string;
  redis?: { ok: boolean; latencyMs: number | null; commandLatencyMs?: number | null; error?: string; note?: string };
  redisServices?: Array<{
    key: string;
    label: string;
    dedicated: boolean;
    sharedWith: string | null;
    ok: boolean;
    latencyMs: number | null;
  }>;
  db?: { ok: boolean; latencyMs: number | null; error?: string; note?: string };
  runtime?: {
    uptimeSeconds: number;
    memoryRssBytes: number;
    memoryHeapUsedBytes: number;
    memoryHeapTotalBytes: number;
    memoryHeapUsedPercent?: number;
    nodeVersion: string;
    environment: string;
  };
  backgroundWork?: {
    available: boolean;
    pendingOutbox: number | null;
    deadLetterOutbox: number | null;
    staleOutbox: number | null;
    unresolvedFailedTasks: number | null;
    checkedAt: string;
    note?: string;
  };
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
  getAdminProducts: (params?: { page?: number; limit?: number; status?: string; q?: string }, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<unknown[]>>('/admin/products', { ...config, params }),

  // FIX ADMIN-API-TYPING-01: explicit ApiResponse<unknown> instead of
  // the implicit `any` — the write response body is not read by any
  // current caller, and unknown documents that fact without
  // pretending to know the shape. When a caller eventually needs to
  // read the updated row, swap in the real type (see useAdminSetProduct
  // Status's onSuccess, which currently only invalidates the list).
  setProductStatus: (id: string, body: { status: string; reason?: string }) =>
    apiClient.patch<ApiResponse<unknown>>(`/admin/products/${id}/status`, body),

  // FIX ADMIN-API-TYPING-01: see getAdminProducts above.
  getAdminServiceListings: (params?: { page?: number; limit?: number; status?: string; q?: string }, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<unknown[]>>('/admin/service-listings', { ...config, params }),

  // FIX ADMIN-API-TYPING-01: see setProductStatus above.
  setServiceListingStatus: (id: string, body: { status: string; reason?: string }) =>
    apiClient.patch<ApiResponse<unknown>>(`/admin/service-listings/${id}/status`, body),


  getServiceRequestDisputes: (params?: { page?: number; limit?: number }, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<unknown[]>>('/admin/service-request-disputes', { ...config, params }),

  resolveServiceRequestDispute: (id: string, body: { resolution: 'COMPLETED' | 'CANCELLED'; note?: string }) =>
    apiClient.patch<ApiResponse<unknown>>(`/admin/service-request-disputes/${id}/resolve`, body),

  // FIX ADMIN-API-TYPING-01: see getAdminProducts above.
  getAdminOpenRequests: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    q?: string;
  }, config?: AxiosRequestConfig) => apiClient.get<ApiResponse<unknown[]>>('/admin/open-requests', { ...config, params }),

  // FIX ADMIN-API-TYPING-01: see setProductStatus above.
  cancelOpenRequest: (id: string, body?: { reason?: string }) =>
    apiClient.patch<ApiResponse<unknown>>(`/admin/open-requests/${id}/cancel`, body ?? {}),

  // FIX ADMIN-API-TYPING-01: single-object response, no items/meta
  // wrapper. Type is defined above (AdminPlatformTrendsResponse)
  // so the .series read in AdminPlatformTrends.tsx is typed end to
  // end; the index signature keeps any future field readable.
  getPlatformTrends: (days?: number, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<AdminPlatformTrendsResponse>>('/admin/trends', { ...config, params: { days } }),

  // FIX ADMIN-API-TYPING-01: type defined above (AdminSystemHealthResponse).
  getSystemHealth: (config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<AdminSystemHealthResponse>>('/admin/system-health', config),

  // Real-browser user simulator. The API backend enforces ADMIN+ and proxies
  // these calls to the separately hosted Playwright runner; its secret never
  // reaches the browser bundle.
  getUserSimulatorStatus: () =>
    apiClient.get<ApiResponse<Record<string, unknown>>>('/admin/user-simulator/status').then(r => requireUserSimulatorData(r.data.data, 'status')),
  getUserSimulatorConfig: () =>
    apiClient.get<ApiResponse<UserSimulatorConfig>>('/admin/user-simulator/config').then(r => requireUserSimulatorData(r.data.data, 'config')),
  updateUserSimulatorConfig: (payload: Partial<UserSimulatorConfig>) =>
    apiClient.patch<ApiResponse<UserSimulatorConfig>>('/admin/user-simulator/config', payload).then(r => requireUserSimulatorData(r.data.data, 'config update')),
  getUserSimulatorScenarios: () =>
    apiClient.get<ApiResponse<UserSimulatorScenario[]>>('/admin/user-simulator/scenarios').then(r => requireUserSimulatorData(r.data.data, 'scenarios')),
  createUserSimulatorScenario: (payload: UserSimulatorScenario) =>
    apiClient.post<ApiResponse<UserSimulatorScenario>>('/admin/user-simulator/scenarios', payload).then(r => requireUserSimulatorData(r.data.data, 'scenario create')),
  updateUserSimulatorScenario: (id: string, payload: UserSimulatorScenario) =>
    apiClient.put<ApiResponse<UserSimulatorScenario>>(`/admin/user-simulator/scenarios/${encodeURIComponent(id)}`, payload).then(r => requireUserSimulatorData(r.data.data, 'scenario update')),
  deleteUserSimulatorScenario: (id: string) =>
    apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/admin/user-simulator/scenarios/${encodeURIComponent(id)}`),
  getUserSimulatorRuns: (limit = 30) =>
    apiClient.get<ApiResponse<UserSimulatorRun[]>>('/admin/user-simulator/runs', { params: { limit } }).then(r => requireUserSimulatorData(r.data.data, 'runs')),
  startUserSimulatorRun: (payload: Record<string, unknown>) =>
    apiClient.post<ApiResponse<UserSimulatorRun>>('/admin/user-simulator/runs', payload, { timeout: 20_000 }).then(r => requireUserSimulatorData(r.data.data, 'run start')),
  getUserSimulatorRun: (id: string) =>
    apiClient.get<ApiResponse<UserSimulatorRun>>(`/admin/user-simulator/runs/${encodeURIComponent(id)}`).then(r => requireUserSimulatorData(r.data.data, 'run detail')),
  stopUserSimulatorRun: (id: string) =>
    apiClient.post<ApiResponse<UserSimulatorRun>>(`/admin/user-simulator/runs/${encodeURIComponent(id)}/stop`, {}).then(r => requireUserSimulatorData(r.data.data, 'run stop')),
  getUserSimulatorReport: (id: string) =>
    apiClient.get<ApiResponse<UserSimulatorRun>>(`/admin/user-simulator/runs/${encodeURIComponent(id)}/report`).then(r => requireUserSimulatorData(r.data.data, 'run report')),
  getUserSimulatorArtifact: (id: string, name: string) =>
    apiClient.get<Blob>(`/admin/user-simulator/runs/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(name)}`, { responseType: 'blob' }).then(r => r.data),
  scanDataIntegrity: () =>
    apiClient.post<ApiResponse<AdminDataIntegrityReport>>('/admin/data-integrity/scan', {}, { timeout: 30_000 }),

  getDeveloperToolsSetting: () =>
    apiClient.get<ApiResponse<DeveloperToolsSetting>>('/admin/developer-tools/setting'),

  setDeveloperToolsSetting: (enabled: boolean) =>
    apiClient.patch<ApiResponse<DeveloperToolsSetting>>('/admin/developer-tools/setting', { enabled }),

  getMonitoringEvents: (limit = 100) =>
    apiClient.get<ApiResponse<{ processLocal: true; events: AdminMonitoringEvent[] }>>('/admin/monitoring/events', { params: { limit } }),
  getMonitoringAlerts: () =>
    apiClient.get<ApiResponse<{ processLocal: true; alerts: AdminMonitoringAlert[] }>>('/admin/monitoring/alerts'),
  acknowledgeMonitoringAlert: (id: string) =>
    apiClient.patch<ApiResponse<{ id: string; status: 'acknowledged' }>>(`/admin/monitoring/alerts/${encodeURIComponent(id)}/acknowledge`, {}),
  getMonitoringHistory: (limit = 60) =>
    apiClient.get<ApiResponse<{ processLocal: true; retentionMinutes: number; samples: AdminMonitoringSample[] }>>('/admin/monitoring/history', { params: { limit } }),

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

  getOpsQueue: (config?: AxiosRequestConfig) =>
    apiClient.get<
      ApiResponse<{
        openReports: number;
        pendingStores: number;
        pendingSellers: number;
        unreviewedFraud: number;
        total: number;
      }>
    >('/admin/ops-queue', config),

  getStats: (config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<AdminStats>>('/admin/stats', config),

  // ── Ads ──────────────────────────────────────────────────────────

  getAds: (params?: AdminGetAdsParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<AdminAd[]>>('/admin/ads', { ...config, params })
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

  getUsers: (params?: AdminGetUsersParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<AdminUser[]>>('/admin/users', { ...config, params })
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

  getSellers: (params?: AdminGetSellersParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<AdminSeller[]>>('/admin/sellers', { ...config, params })
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

  getStores: (params?: AdminGetStoresParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<AdminStore[]>>('/admin/stores', { ...config, params })
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

  getStoreTypes: (config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<AdminStoreType[]>>('/admin/store-types', config),

  createStoreType: (payload: CreateAdminStoreTypePayload) =>
    apiClient.post<ApiResponse<AdminStoreType>>('/admin/store-types', payload),

  updateStoreTypeDefinition: (id: string, payload: UpdateAdminStoreTypePayload) =>
    apiClient.patch<ApiResponse<AdminStoreType>>(`/admin/store-types/${id}`, payload),

  updateStoreTypeStatus: (id: string, isActive: boolean) =>
    apiClient.patch<ApiResponse<AdminStoreType>>(`/admin/store-types/${id}/status`, { isActive }),

  getStoreTypeFields: (storeTypeId: string, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<import('@/types/store.types').StoreTypeField[]>>(`/admin/store-types/${storeTypeId}/fields`, config),
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
  }, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<Report[]>>('/reports', { ...config, params })
      .then((r) => unwrapPaginated<Report>(r)),

  getReportById: (reportId: string, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<Report>>(`/reports/${reportId}`, config),

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

  getAuditLogs: (params?: AdminGetAuditLogsParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<AuditLog[]>>('/admin/audit-logs', { ...config, params })
      .then((r) => unwrapPaginated<AuditLog>(r)),

  // ── Fraud detection ──────────────────────────────────────────────
  // Backend: /admin/fraud/* (fraud.routes.ts, MODERATOR tier+). The
  // module (service/repository/controller/routes/tests) shipped fully
  // wired server-side with no frontend caller at all — riskScore and
  // flaggedForReview were computed and persisted on every ad with no
  // reachable screen to review them from.

  runFraudMonitorScan: () =>
    apiClient.post<ApiResponse<FraudMonitorScanReport>>('/admin/fraud/monitor/scan', {}).then((r) => r.data.data),

  getFraudMonitorHistory: () =>
    apiClient.get<ApiResponse<FraudMonitorHistoryResponse>>('/admin/fraud/monitor/history').then((r) => r.data.data),

  getFlaggedAds: (params?: AdminGetFlaggedAdsParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<FlaggedAd[]>>('/admin/fraud/ads', { ...config, params })
      .then((r) => unwrapPaginated<FlaggedAd>(r)),

  clearAdFraudFlag: (adId: string) =>
    apiClient.patch<ApiResponse<null>>(`/admin/fraud/ads/${adId}/clear`),

  manualFraudFlag: (adId: string, payload: ManualFraudFlagPayload) =>
    apiClient.post<ApiResponse<null>>(`/admin/fraud/ads/${adId}/flag`, payload),

  getFraudSignals: (params?: AdminGetFraudSignalsParams, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<FraudSignal[]>>('/admin/fraud/signals', { ...config, params })
      .then((r) => unwrapPaginated<FraudSignal>(r)),

  reviewFraudSignal: (signalId: string) =>
    apiClient.patch<ApiResponse<FraudSignal>>(`/admin/fraud/signals/${signalId}/review`),
};
