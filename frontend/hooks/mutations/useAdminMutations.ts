/**
 * Admin moderation mutations: feature/pin ads, force-delete ads,
 * activate/deactivate users, resolve reports.
 *
 * REFACTOR: previously split across a facade (useAdminMutations.ts) and
 * useAdminMutationsInternal.ts. The facade's only job was renaming fields
 * back to what adminApi already expects (id -> adId, featured -> isFeatured)
 * — every call site immediately undid that renaming, so it added an
 * indirection layer with no benefit. Components now call these hooks
 * directly with adminApi's actual field names.
 *
 * useAdminSetFeatured and useAdminSetPinned were also duplicated
 * line-for-line (same optimistic-update/rollback shape, different field).
 * useToggleAdField() below factors that out once.
 *
 * FIX LINT-02: renamed from toggleAdField (no `use` prefix) to
 * useToggleAdField. It calls useMutation() internally and was always
 * called correctly (unconditionally, from the top of a real hook) —
 * but a bare function name meant eslint-plugin-react-hooks's
 * rules-of-hooks couldn't recognize it as hook-calling and silently
 * skipped checking it. A future edit that moved this call inside a
 * condition or loop would have compiled clean with no lint warning at
 * all. The `use` prefix is what makes the linter actually watch it.
 */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { adminApi }      from '@/api/admin.api';
import { queryKeys }     from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast }         from 'sonner';
import type { ReportStatus, AssignableRole, AdminAd, AdminUser, AdminSeller, AdminStore, ManualFraudFlagPayload } from '@/types/admin.types';
import type { PaginatedResponse } from '@/types/api.types';

/**
 * FIX P1-7: every admin moderation toggle below fires immediately and
 * changes public-facing state (featured/pinned/active/verified/
 * suspended/role/store status) with only a plain success toast — one
 * misclick (wrong row in a dense table, fat-fingering the wrong
 * button) had no fast way back short of manually re-doing the action
 * and hoping the old value is still remembered correctly. Sonner's
 * toast already supports an inline action button; this wires a
 * "تراجع" (undo) button into it for exactly these reversible toggles
 * that re-fires the same mutation with the field flipped back.
 * Deliberately not used for useAdminForceDeleteAd (irreversible;
 * already gated behind its own ConfirmDialog at the call site) or
 * useAdminBroadcastNotification (a sent notification can't be
 * unsent).
 */
function toastWithUndo(message: string, onUndo: () => void) {
  toast.success(message, { action: { label: 'تراجع', onClick: onUndo } });
}

/**
 * Shared shape for "toggle one boolean field on an ad in the admin list,
 * optimistically, with rollback on error." Used by both featured and pinned.
 */
function useToggleAdField(
  queryClient: QueryClient,
  field: 'isFeatured' | 'isPinned',
  setField: (adId: string, value: boolean) => Promise<unknown>,
  successMessage: (value: boolean) => string,
) {
  const mutation = useMutation({
    mutationFn: ({ adId, value }: { adId: string; value: boolean }) =>
      setField(adId, value),
    onMutate: async ({ adId, value }) => {
      const snapshots = queryClient.getQueriesData<PaginatedResponse<AdminAd>>({
        queryKey: ['admin', 'ads'],
      });
      queryClient.setQueriesData<PaginatedResponse<AdminAd>>(
        { queryKey: ['admin', 'ads'] },
        (old) => {
          if (!old?.items) return old;
          return { ...old, items: old.items.map((ad) => ad.id === adId ? { ...ad, [field]: value } : ad) };
        },
      );
      await queryClient.cancelQueries({ queryKey: ['admin', 'ads'] });
      return { snapshots };
    },
    onSuccess: (_data, { adId, value }) =>
      // FIX P1-7: re-invokes mutate() (not a bare setField call) so
      // undo goes through the same optimistic-update/rollback/
      // invalidation path as the original toggle.
      toastWithUndo(successMessage(value), () => mutation.mutate({ adId, value: !value })),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] }),
  });
  return mutation;
}

export function useAdminSetFeatured() {
  const queryClient = useQueryClient();
  return useToggleAdField(
    queryClient,
    'isFeatured',
    (adId, isFeatured) => adminApi.setFeatured(adId, { isFeatured }),
    (value) => (value ? 'تم تمييز الإعلان' : 'تم إلغاء التمييز'),
  );
}

export function useAdminSetPinned() {
  const queryClient = useQueryClient();
  return useToggleAdField(
    queryClient,
    'isPinned',
    (adId, isPinned) => adminApi.setPinned(adId, { isPinned }),
    (value) => (value ? 'تم تثبيت الإعلان' : 'تم إلغاء التثبيت'),
  );
}

export function useAdminForceDeleteAd() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (adId: string) => adminApi.forceDeleteAd(adId),
    onSuccess: (_data, adId) => {
      queryClient.removeQueries({ queryKey: queryKeys.ads.detail(adId) });
      queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] });
      toast.success('تم حذف الإعلان نهائياً');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * BULK-ADMIN (item 17): bulk feature/pin/delete for the admin ads
 * table. No optimistic update — see useAdminBulkUpdateReportStatus's
 * doc comment for why (the backend's per-id `updated`/`failed` result
 * is the source of truth for a batch, so patching the cache
 * optimistically first would just have to be selectively undone for
 * whichever ids land in `failed`). No toastWithUndo for the same
 * reason bulk report status has none: a batch of up to 100 has no
 * single meaningful "undo".
 */
export function useAdminBulkSetFeatured() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ adIds, isFeatured }: { adIds: string[]; isFeatured: boolean }) =>
      adminApi.bulkSetFeatured(adIds, isFeatured).then((r) => r.data),
    onSuccess: (result) => toastBulkResult('إعلان', result.meta.updatedCount, result.meta.failed),
    onError: (err) => toast.error(parseApiError(err).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] }),
  });
}

export function useAdminBulkSetPinned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ adIds, isPinned }: { adIds: string[]; isPinned: boolean }) =>
      adminApi.bulkSetPinned(adIds, isPinned).then((r) => r.data),
    onSuccess: (result) => toastBulkResult('إعلان', result.meta.updatedCount, result.meta.failed),
    onError: (err) => toast.error(parseApiError(err).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] }),
  });
}

export function useAdminBulkDeleteAds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (adIds: string[]) => adminApi.bulkDeleteAds(adIds).then((r) => r.data),
    onSuccess: (result) => {
      // FIX (matches useAdminForceDeleteAd's single-row behavior):
      // a bulk-deleted ad's own detail-page cache entry must not keep
      // serving stale data if the admin happens to still have it open
      // in another tab.
      result.data.forEach((adId) => queryClient.removeQueries({ queryKey: queryKeys.ads.detail(adId) }));
      toastBulkResult('إعلان محذوف', result.meta.updatedCount, result.meta.failed);
    },
    onError: (err) => toast.error(parseApiError(err).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] }),
  });
}

export function useAdminToggleUserActive() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminApi.toggleUserActive(userId, { isActive }).then((r) => r.data.data),
    onMutate: async ({ userId, isActive }) => {
      const snapshots = queryClient.getQueriesData<PaginatedResponse<AdminUser>>({
        queryKey: ['admin', 'users'],
      });
      queryClient.setQueriesData<PaginatedResponse<AdminUser>>(
        { queryKey: ['admin', 'users'] },
        (old) => {
          if (!old?.items) return old;
          return { ...old, items: old.items.map((u) => u.id === userId ? { ...u, isActive } : u) };
        },
      );
      await queryClient.cancelQueries({ queryKey: ['admin', 'users'] });
      return { snapshots };
    },
    onSuccess: (_data, { userId, isActive }) =>
      // FIX P1-7: re-invokes mutate() itself (not a bare adminApi call)
      // so undo goes through the same optimistic-update/rollback path
      // as the original action, not a fire-and-forget request the
      // cached list would only pick up after its own onSettled
      // invalidation.
      toastWithUndo(
        isActive ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب',
        () => mutation.mutate({ userId, isActive: !isActive }),
      ),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
  return mutation;
}

/**
 * BULK-ADMIN (item 17): bulk activate/deactivate for the admin users
 * table. Role changes are deliberately not batched (see admin.routes.ts
 * / AdminUsersTable.tsx comments — canManageRole outcomes differ per
 * target, so a mixed-role batch has no single safe "assign role X to
 * everyone selected" semantics). Same no-optimistic-update /
 * no-toastWithUndo reasoning as the other bulk hooks in this file.
 */
export function useAdminBulkToggleUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userIds, isActive }: { userIds: string[]; isActive: boolean }) =>
      adminApi.bulkToggleUserActive(userIds, isActive).then((r) => r.data),
    onSuccess: (result) => toastBulkResult('مستخدم', result.meta.updatedCount, result.meta.failed),
    onError: (err) => toast.error(parseApiError(err).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/**
 * Epic 1.1: PATCH /admin/sellers/:id/verify — the report's finding was
 * that this endpoint existed fully server-side (including the
 * SellerProfile.verified badge shown throughout the app) but could
 * never actually be flipped to true through any reachable screen.
 * Mirrors useAdminToggleUserActive's optimistic update exactly.
 */
export function useAdminSetSellerVerified() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ sellerProfileId, verified }: { sellerProfileId: string; verified: boolean }) =>
      adminApi.setSellerVerified(sellerProfileId, { verified }).then((r) => r.data.data),
    onMutate: async ({ sellerProfileId, verified }) => {
      const snapshots = queryClient.getQueriesData<PaginatedResponse<AdminSeller>>({
        queryKey: ['admin', 'sellers'],
      });
      queryClient.setQueriesData<PaginatedResponse<AdminSeller>>(
        { queryKey: ['admin', 'sellers'] },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((s) => (s.id === sellerProfileId ? { ...s, verified } : s)),
          };
        },
      );
      await queryClient.cancelQueries({ queryKey: ['admin', 'sellers'] });
      return { snapshots };
    },
    onSuccess: (_data, { sellerProfileId, verified }) =>
      // FIX P1-7: see useAdminToggleUserActive's comment — undo
      // re-invokes mutate() so it goes through the same optimistic
      // path as the original toggle.
      toastWithUndo(
        verified ? 'تم توثيق البائع' : 'تم إلغاء توثيق البائع',
        () => mutation.mutate({ sellerProfileId, verified: !verified }),
      ),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sellers'] }),
  });
  return mutation;
}

/**
 * Epic 1.1: PATCH /admin/sellers/:id/suspend — same missing-UI gap as
 * verify above. A suspended seller is already blocked server-side from
 * publishing new ads (see ads.service.ts's ensureSellerProfileForAdCreation),
 * this just gives an admin a way to actually set that flag.
 */
export function useAdminSetSellerSuspended() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ sellerProfileId, suspended, reason }: { sellerProfileId: string; suspended: boolean; reason?: string }) =>
      adminApi.setSellerSuspended(sellerProfileId, { suspended, reason }).then((r) => r.data.data),
    onMutate: async ({ sellerProfileId, suspended }) => {
      const snapshots = queryClient.getQueriesData<PaginatedResponse<AdminSeller>>({
        queryKey: ['admin', 'sellers'],
      });
      queryClient.setQueriesData<PaginatedResponse<AdminSeller>>(
        { queryKey: ['admin', 'sellers'] },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((s) => (s.id === sellerProfileId ? { ...s, suspended } : s)),
          };
        },
      );
      await queryClient.cancelQueries({ queryKey: ['admin', 'sellers'] });
      return { snapshots };
    },
    onSuccess: (_data, { sellerProfileId, suspended }) =>
      toastWithUndo(
        suspended ? 'تم إيقاف البائع' : 'تم رفع الإيقاف عن البائع',
        () => mutation.mutate({ sellerProfileId, suspended: !suspended }),
      ),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sellers'] }),
  });
  return mutation;
}

/**
 * BULK-ADMIN (item 17): bulk verify/suspend for the admin sellers
 * table. Same no-optimistic-update / no-toastWithUndo reasoning as the
 * other bulk hooks in this file.
 */
export function useAdminBulkSetSellerVerified() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sellerProfileIds, verified }: { sellerProfileIds: string[]; verified: boolean }) =>
      adminApi.bulkSetSellerVerified(sellerProfileIds, verified).then((r) => r.data),
    onSuccess: (result) => toastBulkResult('بائع', result.meta.updatedCount, result.meta.failed),
    onError: (err) => toast.error(parseApiError(err).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sellers'] }),
  });
}

export function useAdminBulkSetSellerSuspended() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sellerProfileIds, suspended, reason }: { sellerProfileIds: string[]; suspended: boolean; reason?: string }) =>
      adminApi.bulkSetSellerSuspended(sellerProfileIds, suspended, reason).then((r) => r.data),
    onSuccess: (result) => toastBulkResult('بائع', result.meta.updatedCount, result.meta.failed),
    onError: (err) => toast.error(parseApiError(err).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sellers'] }),
  });
}

const ROLE_LABELS_AR: Record<AssignableRole, string> = {
  USER: 'مستخدم عادي',
  MODERATOR: 'مشرف مساعد',
  ADMIN: 'مدير',
};

/**
 * FIX AUDIT-V3-05 / Gap #20 (admin permission tiers): previously there
 * was no way for an admin to promote/demote a user's role from the UI
 * at all — only direct DB access. Now covers all four backend roles
 * (USER/MODERATOR/ADMIN/SUPER_ADMIN), though only USER/MODERATOR/ADMIN
 * are ever sent as the *new* role here — SUPER_ADMIN is deliberately
 * unreachable through this endpoint (see AssignableRole). Mirrors
 * useAdminToggleUserActive's optimistic update.
 */
export function useAdminChangeRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AssignableRole }) =>
      adminApi.changeRole(userId, role).then((r) => r.data.data),
    onMutate: async ({ userId, role }) => {
      const snapshots = queryClient.getQueriesData<PaginatedResponse<AdminUser>>({
        queryKey: ['admin', 'users'],
      });
      queryClient.setQueriesData<PaginatedResponse<AdminUser>>(
        { queryKey: ['admin', 'users'] },
        (old) => {
          if (!old?.items) return old;
          return { ...old, items: old.items.map((u) => u.id === userId ? { ...u, role } : u) };
        },
      );
      await queryClient.cancelQueries({ queryKey: ['admin', 'users'] });
      return { snapshots };
    },
    onSuccess: (_data, { role }) =>
      toast.success(`تم تغيير الدور إلى ${ROLE_LABELS_AR[role]}`),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/**
 * PATCH /admin/stores/:id/status (audit report issue #1) — approve
 * (PENDING → ACTIVE) or block a store. Mirrors useAdminSetSellerSuspended's
 * optimistic-update/rollback shape. Unlike suspend, this has no
 * ConfirmDialog step at the call site since both directions (approve/
 * block) are equally reversible admin actions, same as verify above.
 */
export function useAdminUpdateStoreStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, status, reason }: { storeId: string; status: 'ACTIVE' | 'PENDING' | 'BLOCKED'; reason?: string }) =>
      adminApi.updateStoreStatus(storeId, { status, reason }).then((r) => r.data.data),
    onMutate: async ({ storeId, status }) => {
      const snapshots = queryClient.getQueriesData<PaginatedResponse<AdminStore>>({
        queryKey: ['admin', 'stores'],
      });
      queryClient.setQueriesData<PaginatedResponse<AdminStore>>(
        { queryKey: ['admin', 'stores'] },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((s) => (s.id === storeId ? { ...s, status } : s)),
          };
        },
      );
      await queryClient.cancelQueries({ queryKey: ['admin', 'stores'] });
      return { snapshots };
    },
    onSuccess: (_data, { status }) => {
      const messages: Record<string, string> = {
        ACTIVE:  'تمت الموافقة على المتجر',
        BLOCKED: 'تم حظر المتجر',
        PENDING: 'تم إرجاع المتجر إلى قيد المراجعة',
      };
      toast.success(messages[status] ?? 'تم تحديث حالة المتجر');
    },
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'stores'] }),
  });
}

// FIX BUG-02: makes StorePlan.FEATURED reachable from the admin stores
// table — same optimistic-update/rollback shape as
// useAdminUpdateStoreStatus above.
export function useAdminUpdateStorePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, plan }: { storeId: string; plan: 'FREE' | 'FEATURED' }) =>
      adminApi.updateStorePlan(storeId, { plan }).then((r) => r.data.data),
    onMutate: async ({ storeId, plan }) => {
      const snapshots = queryClient.getQueriesData<PaginatedResponse<AdminStore>>({
        queryKey: ['admin', 'stores'],
      });
      queryClient.setQueriesData<PaginatedResponse<AdminStore>>(
        { queryKey: ['admin', 'stores'] },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((s) => (s.id === storeId ? { ...s, plan } : s)),
          };
        },
      );
      await queryClient.cancelQueries({ queryKey: ['admin', 'stores'] });
      return { snapshots };
    },
    onSuccess: (_data, { plan }) => {
      toast.success(plan === 'FEATURED' ? 'تم تمييز المتجر' : 'تم إلغاء تمييز المتجر');
    },
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'stores'] }),
  });
}

/**
 * BULK-ADMIN (item 17): bulk status update for the admin stores table
 * — the realistic use case is clearing a queue of PENDING stores
 * awaiting approval. Same no-optimistic-update / no-toastWithUndo
 * reasoning as the other bulk hooks in this file.
 */
export function useAdminBulkUpdateStoreStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeIds, status, reason }: { storeIds: string[]; status: 'ACTIVE' | 'PENDING' | 'BLOCKED'; reason?: string }) =>
      adminApi.bulkUpdateStoreStatus(storeIds, status, reason).then((r) => r.data),
    onSuccess: (result) => toastBulkResult('متجر', result.meta.updatedCount, result.meta.failed),
    onError: (err) => toast.error(parseApiError(err).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'stores'] }),
  });
}

/**
 * POST /admin/notifications/broadcast — existed fully server-side with
 * no reachable UI (see admin.api.ts's broadcastNotification doc
 * comment). No optimistic update here: unlike the toggles above there
 * is no cached list entry to patch, and a broadcast isn't idempotent,
 * so it's a plain mutation.
 */
export function useAdminBroadcastNotification() {
  return useMutation({
    mutationFn: (payload: { title: string; body: string }) =>
      adminApi
        .broadcastNotification({ userIds: ['all'], allUsers: true, ...payload })
        .then((r) => r.data.data),
    onSuccess: (result) =>
      toast.success(`تم إرسال الإشعار إلى ${result?.recipientCount ?? 0} مستخدم`),
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * BULK-ADMIN (item 17): shared partial-success toast for every bulk
 * mutation below — same message shape useAdminBulkUpdateReportStatus
 * introduced first, factored out once it's about to be repeated for
 * ads/users/sellers/stores rather than copy-pasted five times.
 */
function toastBulkResult(itemLabel: string, updatedCount: number, failed: { id: string; reason: string }[]) {
  if (failed.length === 0) {
    toast.success(`تم تحديث ${updatedCount} ${itemLabel}`);
  } else {
    toast.error(`تم تحديث ${updatedCount} من أصل ${updatedCount + failed.length} ${itemLabel} — فشل ${failed.length}`);
  }
}

export function useAdminUpdateReportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, status }: { reportId: string; status: Extract<ReportStatus, 'RESOLVED' | 'DISMISSED'> }) =>
      adminApi.updateReportStatus(reportId, status).then((r) => r.data.data),
    onSuccess: (updated) => {
      if (updated) queryClient.setQueryData(queryKeys.admin.reportDetail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      toast.success('تم تحديث حالة البلاغ');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * BULK-ADMIN (item 17): batch resolve/dismiss from the reports queue.
 * No optimistic update here (unlike the single-row toggles above) —
 * the backend's own batch result (`updated`/`failed`) is the source of
 * truth for which ids actually applied, and showing an optimistic
 * change for ids that might come back in `failed` would have to be
 * un-done selectively anyway, which is exactly what onSuccess already
 * reports precisely. A plain invalidate on settle is simpler and
 * equally fast for a queue-clearing action that isn't on a tight
 * latency budget the way a single-row toggle is.
 *
 * Deliberately no toastWithUndo: unlike the single-toggle mutations,
 * a batch of up to 100 reports has no single "undo" action that isn't
 * itself just re-running the reverse batch — the caller decides
 * whether that's worth offering, not this hook.
 */
export function useAdminBulkUpdateReportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportIds,
      status,
    }: {
      reportIds: string[];
      status: Extract<ReportStatus, 'RESOLVED' | 'DISMISSED'>;
    }) => adminApi.bulkUpdateReportStatus(reportIds, status).then((r) => r.data),
    onSuccess: (result) => toastBulkResult('بلاغ', result.meta.updatedCount, result.meta.failed),
    onError: (err) => toast.error(parseApiError(err).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] }),
  });
}

// ── Fraud detection ───────────────────────────────────────────────
// Backend module (service/repository/routes/tests) shipped fully
// working with zero frontend caller — see AdminFraudTable.tsx.

/**
 * PATCH /admin/fraud/ads/:adId/clear — admin decided a flagged ad is
 * legitimate. No optimistic update (unlike useToggleAdField above):
 * this is a one-way moderation decision gated behind its own
 * ConfirmDialog at the call site, same reasoning as
 * useAdminForceDeleteAd, so a plain invalidate-on-settle is enough.
 */
export function useAdminClearFraudFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (adId: string) => adminApi.clearAdFraudFlag(adId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'fraud'] });
      toast.success('تم إلغاء علامة الاحتيال عن الإعلان');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/** POST /admin/fraud/ads/:adId/flag — manual flag, outside the automated scoring path. */
export function useAdminManualFraudFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ adId, payload }: { adId: string; payload: ManualFraudFlagPayload }) =>
      adminApi.manualFraudFlag(adId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'fraud'] });
      toast.success('تم وضع علامة احتيال على الإعلان');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/** PATCH /admin/fraud/signals/:id/review — marks one signal as reviewed (doesn't clear the ad's own flag). */
export function useAdminReviewFraudSignal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signalId: string) => adminApi.reviewFraudSignal(signalId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'fraud'] });
      toast.success('تم تأكيد مراجعة الإشارة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useAdminSetProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      adminApi.setProductStatus(id, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      // FIX ADMIN-SILENT-FAIL: was missing both a success toast and an
      // onError handler, unlike every other admin mutation in this file.
      // A failed product approval (5xx, permission blip, network) looked
      // identical to a successful one from the admin's seat — the row
      // simply did not change, with no explanation. Same feedback shape
      // as useAdminForceDeleteAd above.
      toast.success('تم تحديث حالة المنتج');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useAdminSetServiceListingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      adminApi.setServiceListingStatus(id, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'service-listings'] });
      // FIX ADMIN-SILENT-FAIL: see useAdminSetProductStatus above.
      toast.success('تم تحديث حالة الخدمة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

// FIX DEAD-CODE-SERVICE-BROADCASTS-01: useAdminCancelServiceBroadcast
// removed -- its only caller was the (also-removed) frontend API method
// adminApi.cancelServiceBroadcast, and no component ever imported this
// hook. The live successor is useAdminCancelOpenRequest below.
export function useAdminCancelOpenRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminApi.cancelOpenRequest(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'open-requests'] });
      // FIX ADMIN-SILENT-FAIL: see useAdminSetProductStatus above.
      toast.success('تم إلغاء الطلب المفتوح');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
