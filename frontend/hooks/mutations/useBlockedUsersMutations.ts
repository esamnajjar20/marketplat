'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { blockedUsersApi } from '@/api/blocked-users.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';

/**
 * POST /blocked-users/:userId — toggles block/unblock. Same shape as
 * useToggleStoreFollow: updates the shared blockedUsers.ids() Set
 * directly and synchronously (so ChatWindow's button flips immediately,
 * without waiting for the invalidated list query to refetch), then
 * invalidates the list query and the conversations list — a fresh
 * block/unblock can change whether a thread is usable, so
 * conversations should refetch too.
 */
export function useToggleUserBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => blockedUsersApi.toggleBlock(userId).then((r) => r.data.data),
    onSuccess: (data, userId) => {
      queryClient.setQueryData<Set<string>>(queryKeys.blockedUsers.ids(), (prev) => {
        const idSet = new Set(prev ?? []);
        if (data?.action === 'blocked') idSet.add(userId); else idSet.delete(userId);
        return idSet;
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.mine() });
      toast.success(data?.action === 'blocked' ? 'تم حظر المستخدم' : 'تم إلغاء حظر المستخدم');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
