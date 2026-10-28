'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { followsApi, type FollowTargetType } from '@/api/follows.api';
import { queryKeys } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import { runSerializedMutation } from '@/lib/serialMutationQueue';
import { getSessionCleanupVersion } from '@/lib/authCleanup';

export function useToggleFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['follow-toggle'],
    mutationFn: ({ targetType, targetId }: { targetType: FollowTargetType; targetId: string }) =>
      runSerializedMutation(JSON.stringify(['follow', getSessionCleanupVersion(), targetType, targetId]), () =>
        followsApi.toggle(targetType, targetId).then((r) => r.data.data),
      ),
    onSuccess: (data, vars) => {
      if (!data) return;
      queryClient.setQueryData(queryKeys.follows.status(vars.targetType, vars.targetId), { following: data.action === 'followed' });
      // Keep target-specific detail caches fresh for every success, but defer
      // shared list/feed invalidation until the last follow toggle settles.
      if (vars.targetType === 'USER') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.follows.followersRoot('USER', vars.targetId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(vars.targetId) });
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
