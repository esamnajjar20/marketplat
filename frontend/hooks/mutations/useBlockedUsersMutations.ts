'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { blockedUsersApi } from '@/api/blocked-users.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth.store';
import { toastMutationError } from '@/lib/mutationFeedback';

/**
 * POST /blocked-users/:userId — toggles block/unblock. Same shape as
 * Update the per-user status cache directly so profile/chat buttons flip
 * immediately, then invalidate the management list and conversations — a fresh
 * block/unblock can change whether a thread is usable, so
 * conversations should refetch too.
 */
export function useToggleUserBlock() {
  const queryClient = useQueryClient();
  const viewerId = useAuthStore((state) => state.user?.id ?? null);

  return useMutation({
    mutationFn: (userId: string) => blockedUsersApi.toggleBlock(userId).then((r) => r.data.data),
    onSuccess: async (data, userId) => {
      const statusKey = queryKeys.blockedUsers.status(userId);
      await queryClient.cancelQueries({ queryKey: statusKey });
      const isBlockedByMe = data?.action === 'blocked';
      queryClient.setQueryData(statusKey, isBlockedByMe);
      // Keep the combined public-profile header cache in sync as well;
      // it now owns the block button's initial state and avoids a second GET.
      const profileStateKey = queryKeys.users.profileState(userId, viewerId ?? 'anonymous');
      queryClient.setQueryData<{ following: boolean; online: boolean; lastSeenAt: string | null; isBlockedByMe: boolean }>(
        profileStateKey,
        (current) => current ? { ...current, isBlockedByMe } : current,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.mineRoot() });
      toast.success(data?.action === 'blocked' ? 'تم حظر المستخدم' : 'تم إلغاء حظر المستخدم');
    },
    onError: toastMutationError,
  });
}
