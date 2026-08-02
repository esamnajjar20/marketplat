'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { storesApi } from '@/api/stores.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type { CreateStoreReviewPayload } from '@/types/store.types';

/** POST /stores/:id/reviews — once per (user, store). */
export function useCreateStoreReview(storeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateStoreReviewPayload) =>
      storesApi.createReview(storeId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storeReviews.forStore(storeId) });
      // Rating aggregate lives on the seller profile embedded in the
      // store detail response — refetch it too so the new average
      // shows immediately, same reasoning as useToggleStoreFollow.
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.detail(storeId) });
      toast.success('تم إرسال تقييمك بنجاح');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
