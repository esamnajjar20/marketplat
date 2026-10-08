'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { storiesApi } from '@/api/stories.api';
import { queryKeys } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';

export function useCreateStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: storiesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.stories.all() });
      toast.success('تم نشر الستوري');
    },
    onError: toastMutationError,
  });
}

export function useViewStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) => storiesApi.view(storyId),
    onSuccess: (_data, storyId) => {
      qc.invalidateQueries({ queryKey: queryKeys.stories.feed() });
      qc.invalidateQueries({ queryKey: queryKeys.stories.viewers(storyId) });
    },
  });
}

export function useDeleteStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) => storiesApi.remove(storyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.stories.all() });
      toast.success('تم حذف الستوري');
    },
    onError: toastMutationError,
  });
}
