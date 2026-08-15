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
import type { ReportStatus, AssignableRole, AdminAd, AdminUser, AdminSeller, AdminStore } from '@/types/admin.types';
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
    mutationFn: ({ sellerProfileId, suspended }: { sellerProfileId: string; suspended: boolean }) =>
      adminApi.setSellerSuspended(sellerProfileId, { suspended }).then((r) => r.data.data),
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
    mutationFn: ({ storeId, status }: { storeId: string; status: 'PENDING' | 'ACTIVE' | 'BLOCKED' }) =>
      adminApi.updateStoreStatus(storeId, { status }).then((r) => r.data.data),
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
    onSuccess: (result) => {
      const updatedCount = result.meta?.updatedCount ?? result.data?.length ?? 0;
      const failed = result.meta?.failed ?? [];
      if (failed.length === 0) {
        toast.success(`تم تحديث ${updatedCount} بلاغ`);
      } else {
        toast.error(`تم تحديث ${updatedCount} من أصل ${updatedCount + failed.length} بلاغ — فشل ${failed.length}`);
      }
    },
    onError: (err) => toast.error(parseApiError(err).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] }),
  });
}
