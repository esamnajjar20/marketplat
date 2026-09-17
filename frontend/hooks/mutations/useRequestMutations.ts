'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { requestsApi, type CreateRequestBody, type SubmitOfferBody } from '@/api/requests.api';
import { queryKeys } from '@/lib/queryKeys';
import { ROUTES } from '@/lib/constants';

export function useCreateRequest() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (body: CreateRequestBody) => requestsApi.create(body).then((r) => r.data.data),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: queryKeys.requests.all() });
      toast.success('تم نشر الطلب');
      if (created) {
        router.push(ROUTES.request(created.id));
      }
    },
    onError: () => toast.error('تعذّر نشر الطلب'),
  });
}

export function useCancelRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requestsApi.cancel(id).then((r) => r.data.data),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.requests.all() });
      void qc.invalidateQueries({ queryKey: queryKeys.requests.detail(id) });
      toast.success('تم إلغاء الطلب');
    },
    onError: () => toast.error('تعذّر إلغاء الطلب'),
  });
}

export function useSubmitRequestOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SubmitOfferBody }) =>
      requestsApi.submitOffer(id, body).then((r) => r.data.data),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.requests.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.requests.myOffers() });
      toast.success('تم إرسال العرض');
    },
    onError: () => toast.error('تعذّر إرسال العرض'),
  });
}

export function useWithdrawRequestOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, offerId }: { id: string; offerId: string }) =>
      requestsApi.withdrawOffer(id, offerId).then((r) => r.data.data),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.requests.detail(id) });
      toast.success('تم سحب العرض');
    },
    onError: () => toast.error('تعذّر سحب العرض'),
  });
}

export function useAcceptRequestOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, offerId }: { id: string; offerId: string }) =>
      requestsApi.acceptOffer(id, offerId).then((r) => r.data.data),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.requests.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.requests.all() });
      toast.success('تم قبول العرض');
    },
    onError: () => toast.error('تعذّر قبول العرض'),
  });
}
