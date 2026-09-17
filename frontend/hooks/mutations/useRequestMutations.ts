'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { requestsApi, type CreateRequestBody, type SubmitOfferBody } from '@/api/requests.api';
import { queryKeys } from '@/lib/queryKeys';
import { ROUTES } from '@/lib/constants';
import { toastMutationError } from '@/lib/mutationFeedback';
import { parseApiError } from '@/lib/errorParser';
import { isNetworkLikeFailure, ONLINE_DRAFT_TOAST } from '@/lib/isNetworkLikeFailure';
import { saveAdDraft } from '@/lib/offlineAdDrafts';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
import {
  getActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';
import { useAuthStore, selectUser } from '@/store/auth.store';

export function useCreateRequest() {
  const qc = useQueryClient();
  const router = useRouter();
  const userId = useAuthStore(selectUser)?.id ?? null;
  const operationIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: (body: CreateRequestBody) => {
      operationIdRef.current = newOfflineOperationId();
      return requestsApi.create(body).then((r) => r.data.data);
    },
    onSuccess: (created) => {
      clearActiveOfflineDraftId();
      void qc.invalidateQueries({ queryKey: queryKeys.requests.all() });
      toast.success('تم نشر طلبك');
      if (created?.id) router.push(ROUTES.request(created.id));
      else router.push(ROUTES.requests);
    },
    onError: async (err, body) => {
      const parsed = parseApiError(err);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline || isNetworkLikeFailure(parsed)) {
        try {
          await saveAdDraft({
            id: getActiveOfflineDraftId() ?? undefined,
            mode: 'create',
            kind: 'open-request',
            payload: {
              title: String(body.title ?? ''),
              description: String(body.description ?? ''),
              categoryId: body.categoryId ?? null,
              city: body.city ?? null,
              type: body.type,
              budgetMin: body.budgetMin ?? null,
              budgetMax: body.budgetMax ?? null,
            },
            userId,
            operationId: operationIdRef.current ?? undefined,
          });
          if (offline) {
            toast.message('محفوظ محليًا — بانتظار الاتصال', {
              description: 'يمكنك متابعته من مركز المزامنة',
            });
          } else {
            toast.message(ONLINE_DRAFT_TOAST.create.title, {
              description: ONLINE_DRAFT_TOAST.create.description,
            });
          }
          return;
        } catch {
          /* fall through */
        }
      }
      toastMutationError(err);
    },
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
    onError: toastMutationError,
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
    onError: toastMutationError,
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
    onError: toastMutationError,
  });
}

export function useAcceptRequestOffer() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: ({ id, offerId }: { id: string; offerId: string }) =>
      requestsApi.acceptOffer(id, offerId).then((r) => r.data.data),
    onSuccess: (data, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.requests.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.requests.all() });
      const conversationId = (data as { conversationId?: string } | undefined)?.conversationId;
      if (conversationId) {
        toast.success('تم قبول العرض — جاري فتح المحادثة');
        router.push(ROUTES.conversationDetail(conversationId));
        return;
      }
      toast.success('تم قبول العرض', {
        description: 'تم فتح محادثة للتنسيق مع صاحب العرض',
        action: {
          label: 'الرسائل',
          onClick: () => {
            router.push(ROUTES.messages);
          },
        },
      });
    },
    onError: toastMutationError,
  });
}
