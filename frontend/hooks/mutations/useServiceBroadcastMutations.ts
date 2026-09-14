'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';

/** POST /service-broadcasts — عميل ينشر طلب خدمة مفتوح في السوق. */
export function useCreateServiceBroadcast() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (body: {
      categoryId: string;
      title: string;
      description: string;
      city?: string;
    }) => serviceBroadcastsApi.create(body).then((r) => r.data.data),
    onSuccess: (created) => {
      toast.success('تم نشر طلبك في سوق الطلبات');
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts'] });
      if (created?.id) {
        router.push(ROUTES.serviceBroadcast(created.id));
      } else {
        router.push(ROUTES.myServiceBroadcasts);
      }
    },
    onError: toastMutationError,
  });
}

/** PATCH /service-broadcasts/:id/cancel */
export function useCancelServiceBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serviceBroadcastsApi.cancel(id).then((r) => r.data.data),
    onSuccess: (_data, id) => {
      toast.success('تم إلغاء الطلب');
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts'] });
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts', id] });
    },
    onError: toastMutationError,
  });
}

export function useWithdrawServiceQuote(broadcastId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (quoteId: string) =>
      serviceBroadcastsApi.withdrawQuote(broadcastId, quoteId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts', broadcastId] });
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts', 'my-quotes'] });
      toast.success('تم سحب العرض');
    },
    onError: toastMutationError,
  });
}

export function useAcceptServiceQuote(broadcastId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (quoteId: string) =>
      serviceBroadcastsApi.acceptQuote(broadcastId, quoteId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts', broadcastId] });
      toast.success('تم قبول العرض');
    },
    onError: toastMutationError,
  });
}
