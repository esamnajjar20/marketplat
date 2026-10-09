'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { followsApi, type FollowTargetType } from '@/api/follows.api';
import { queryKeys } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';

export function useToggleFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetType, targetId }: { targetType: FollowTargetType; targetId: string }) =>
      followsApi.toggle(targetType, targetId).then((r) => r.data.data),
    onSuccess: (data, vars) => {
      if (!data) return;
      queryClient.setQueryData(queryKeys.follows.status(vars.targetType, vars.targetId), { following: data.action === 'followed' });
      queryClient.invalidateQueries({ queryKey: queryKeys.follows.myRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.follows.feedRoot() });
      if (vars.targetType === 'USER') {
        queryClient.invalidateQueries({ queryKey: queryKeys.follows.followersRoot('USER', vars.targetId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(vars.targetId) });
      } else if (vars.targetType === 'STORE') {
        queryClient.invalidateQueries({ queryKey: queryKeys.stores.detail(vars.targetId) });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.categories.all() });
      }
      toast.success(data.action === 'followed' ? 'تمت المتابعة' : 'تم إلغاء المتابعة');
    },
    onError: toastMutationError,
  });
}
