'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { followsApi, type FollowTargetType } from '@/api/follows.api';
import { queryKeys } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import { runSerializedMutation } from '@/lib/serialMutationQueue';
import { getSessionCleanupVersion } from '@/lib/authCleanup';
import { useAuthStore } from '@/store/auth.store';

export function useToggleFollow() {
  const queryClient = useQueryClient();
  const viewerId = useAuthStore((state) => state.user?.id ?? null);
  return useMutation({
    mutationKey: ['follow-toggle'],
    mutationFn: ({ targetType, targetId }: { targetType: FollowTargetType; targetId: string }) =>
      runSerializedMutation(JSON.stringify(['follow', getSessionCleanupVersion(), targetType, targetId]), () =>
        followsApi.toggle(targetType, targetId).then((r) => r.data.data),
      ),
    onSuccess: (data, vars) => {
      if (!data) return;
      queryClient.setQueryData<boolean>(queryKeys.follows.status(vars.targetType, vars.targetId), data.action === 'followed');
      // Keep target-specific detail caches fresh for every success, but defer
      // shared list/feed invalidation until the last follow toggle settles.
      if (vars.targetType === 'USER') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.follows.followersRoot('USER', vars.targetId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(vars.targetId) });
        if (viewerId) {
          queryClient.setQueryData(
            queryKeys.users.profileState(vars.targetId, viewerId),
            (current: { following: boolean; online: boolean; lastSeenAt: string | null } | undefined) =>
              current ? { ...current, following: data.action === 'followed' } : current,
          );
        }
      } else if (vars.targetType === 'STORE') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.stores.detail(vars.targetId) });
      } else {
        // Category follow state is represented across category listings; keep
        // its category cache fresh even if another target is still pending.
        void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all() });
      }
      if (queryClient.isMutating({ mutationKey: ['follow-toggle'] }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.follows.myRoot() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.follows.feedRoot() });
      }
      toast.success(data.action === 'followed' ? 'تمت المتابعة' : 'تم إلغاء المتابعة');
    },
    onError: toastMutationError,
  });
}
