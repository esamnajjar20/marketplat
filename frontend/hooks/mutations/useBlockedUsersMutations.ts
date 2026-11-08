'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { blockedUsersApi } from '@/api/blocked-users.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';

/**
 * POST /blocked-users/:userId — toggles block/unblock. Same shape as
 * Update the per-user status cache directly so profile/chat buttons flip
 * immediately, then invalidate the management list and conversations — a fresh
 * block/unblock can change whether a thread is usable, so
 * conversations should refetch too.
 */
export function useToggleUserBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => blockedUsersApi.toggleBlock(userId).then((r) => r.data.data),
    onSuccess: async (data, userId) => {
      const statusKey = queryKeys.blockedUsers.status(userId);
      await queryClient.cancelQueries({ queryKey: statusKey });
      queryClient.setQueryData(statusKey, data?.action === 'blocked');
      queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.mineRoot() });
      toast.success(data?.action === 'blocked' ? 'تم حظر المستخدم' : 'تم إلغاء حظر المستخدم');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
