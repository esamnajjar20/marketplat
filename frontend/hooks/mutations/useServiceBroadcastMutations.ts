'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';
import { parseApiError } from '@/lib/errorParser';
import { isNetworkLikeFailure, ONLINE_DRAFT_TOAST } from '@/lib/isNetworkLikeFailure';
import { saveAdDraft } from '@/lib/offlineAdDrafts';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
import {
  getActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';
import { useAuthStore, selectUser } from '@/store/auth.store';

/** POST /service-broadcasts — عميل ينشر طلب خدمة مفتوح في السوق.
 * PHASE-OFFLINE-DRAFTS: نفس مسار إعلان/منتج/خدمة — عند انقطاع الشبكة
 * تُحفظ مسودة IndexedDB (kind: service-broadcast) وتظهر بمركز المزامنة.
 */
export function useCreateServiceBroadcast() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const userId = useAuthStore(selectUser)?.id ?? null;
  const operationIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: (body: {
      categoryId: string;
      title: string;
      description: string;
      city?: string;
    }) => {
      operationIdRef.current = newOfflineOperationId();
      return serviceBroadcastsApi
        .create(body, operationIdRef.current)
        .then((r) => r.data.data);
    },
    onSuccess: (created) => {
      clearActiveOfflineDraftId();
      toast.success('تم نشر طلبك في سوق الطلبات');
      queryClient.invalidateQueries({ queryKey: ['service-broadcasts'] });
      if (created?.id) {
        router.push(ROUTES.serviceBroadcast(created.id));
      } else {
        router.push(ROUTES.myServiceBroadcasts);
      }
    },
    onError: async (err, body) => {
      const parsed = parseApiError(err);
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline || isNetworkLikeFailure(parsed)) {
        try {
          await saveAdDraft({
            id: getActiveOfflineDraftId() ?? undefined,
            mode: 'create',
            kind: 'service-broadcast',
            payload: {
              title: String(body.title ?? ''),
              description: String(body.description ?? ''),
              categoryId: body.categoryId ?? null,
              city: body.city ?? null,
            },
            status: offline ? 'pending_sync' : 'failed',
            lastError: offline ? undefined : parsed.message,
            operationId: operationIdRef.current,
            userId,
          });
          if (offline) {
            toast.message('محفوظ محليًا — بانتظار الاتصال', {
              description: 'سيُنشر طلب الخدمة تلقائيًا عند عودة الاتصال. الإعدادات → المزامنة.',
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
      toast.success('تم قبول العرض', {
        description: 'تم فتح محادثة للتنسيق مع مقدّم الخدمة',
        action: {
          label: 'الرسائل',
          onClick: () => {
            window.location.href = ROUTES.messages;
          },
        },
      });
    },
    onError: toastMutationError,
  });
}
