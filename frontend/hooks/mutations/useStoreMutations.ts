'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { storesApi } from '@/api/stores.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type { CreateStorePayload, UpdateStorePayload } from '@/types/store.types';

/**
 * POST /stores — one-time store creation. On success, invalidates the
 * "my store" query so useMyStore() picks up the new store instead of
 * continuing to show the create-a-store CTA.
 */
export function useCreateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateStorePayload) =>
      storesApi.create(payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.me() });
      toast.success('تم إنشاء المتجر بنجاح');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/** PATCH /stores/me — partial update. */
export function useUpdateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateStorePayload) =>
      storesApi.updateMyStore(payload).then((r) => r.data.data),
    onSuccess: () => {
      // Invalidate the whole ['stores'] prefix, not just 'me' — the
      // public directory/detail queries shouldn't keep showing stale
      // data after an owner edits their store. Same reasoning as
      // useUpdateServiceListing's I-05 fix.
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.all() });
      toast.success('تم حفظ التعديلات');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * POST /stores/:id/follow — toggles follow/unfollow. Optimistic update
 * on the store detail query's follower count would require guessing
 * the shape of `_count`, so this simply invalidates on settle — the
 * detail page refetches with the accurate count from the server.
 *
 * FIX BUG-03 (cont.): also update queryKeys.stores.followedIds()
 * directly and synchronously here — this is the Set useIsFollowingStore
 * reads to decide the button's label. Without this, the button only
 * flipped after the invalidated followed-list query finished refetching
 * (a visible lag, and it stayed wrong the whole time for a logged-in
 * user acting on their own toggle).
 */
export function useToggleStoreFollow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (storeId: string) => storesApi.toggleFollow(storeId).then((r) => r.data.data),
    onSuccess: (data, storeId) => {
      queryClient.setQueryData<Set<string>>(queryKeys.stores.followedIds(), (prev) => {
        const idSet = new Set(prev ?? []);
        if (data?.action === 'followed') idSet.add(storeId); else idSet.delete(storeId);
        return idSet;
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.detail(storeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.followed() });
      toast.success(data?.action === 'followed' ? 'تمت متابعة المتجر' : 'تم إلغاء متابعة المتجر');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
