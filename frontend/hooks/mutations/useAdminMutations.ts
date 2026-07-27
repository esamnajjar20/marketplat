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
import type { ReportStatus } from '@/types/admin.types';

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
  return useMutation({
    mutationFn: ({ adId, value }: { adId: string; value: boolean }) =>
      setField(adId, value),
    onMutate: async ({ adId, value }) => {
      const snapshots = queryClient.getQueriesData({ queryKey: ['admin', 'ads'] });
      queryClient.setQueriesData({ queryKey: ['admin', 'ads'] }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((ad: any) => ad.id === adId ? { ...ad, [field]: value } : ad) };
      });
      await queryClient.cancelQueries({ queryKey: ['admin', 'ads'] });
      return { snapshots };
    },
    onSuccess: (_data, { value }) => toast.success(successMessage(value)),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] }),
  });
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
  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminApi.toggleUserActive(userId, { isActive }).then((r) => r.data.data),
    onMutate: async ({ userId, isActive }) => {
      const snapshots = queryClient.getQueriesData({ queryKey: ['admin', 'users'] });
      queryClient.setQueriesData({ queryKey: ['admin', 'users'] }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((u: any) => u.id === userId ? { ...u, isActive } : u) };
      });
      await queryClient.cancelQueries({ queryKey: ['admin', 'users'] });
      return { snapshots };
    },
    onSuccess: (_data, { isActive }) => toast.success(isActive ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب'),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/**
 * FIX AUDIT-V3-05: previously there was no way for an admin to
 * promote/demote a user's role from the UI at all — only direct DB
 * access. Mirrors useAdminToggleUserActive's optimistic update.
 */
export function useAdminChangeRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'USER' | 'ADMIN' }) =>
      adminApi.changeRole(userId, role).then((r) => r.data.data),
    onMutate: async ({ userId, role }) => {
      const snapshots = queryClient.getQueriesData({ queryKey: ['admin', 'users'] });
      queryClient.setQueriesData({ queryKey: ['admin', 'users'] }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((u: any) => u.id === userId ? { ...u, role } : u) };
      });
      await queryClient.cancelQueries({ queryKey: ['admin', 'users'] });
      return { snapshots };
    },
    onSuccess: (_data, { role }) =>
      toast.success(role === 'ADMIN' ? 'تم ترقية المستخدم إلى مدير' : 'تم تنزيل المستخدم إلى مستخدم عادي'),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
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
