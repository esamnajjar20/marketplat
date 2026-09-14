'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';

/**
 * DELETE /service-broadcasts/:id/quotes/:quoteId — provider withdraws
 * their own PENDING quote. Invalidates both the broadcast detail (so a
 * customer viewing it sees the quote disappear/update) and the
 * provider's own "my quotes" list, using the same literal query-key
 * arrays the two pages that read this data already key on.
 */
export function useWithdrawServiceQuote(broadcastId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (quoteId: string) => serviceBroadcastsApi.withdrawQuote(broadcastId, quoteId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts', broadcastId] });
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts', 'my-quotes'] });
      toast.success('تم سحب العرض');
    },
    onError: toastMutationError,
  });
}

/**
 * PATCH /service-broadcasts/:id/quotes/:quoteId/accept — customer picks
 * a winning quote. Invalidates the broadcast detail so the accepted
 * status and the now-declined competing quotes reflect immediately.
 */
export function useAcceptServiceQuote(broadcastId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (quoteId: string) => serviceBroadcastsApi.acceptQuote(broadcastId, quoteId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts', broadcastId] });
      toast.success('تم قبول العرض');
    },
    onError: toastMutationError,
  });
}
