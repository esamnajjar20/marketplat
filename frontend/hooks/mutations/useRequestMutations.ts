'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { requestsApi, type CreateRequestBody, type SubmitOfferBody } from '@/api/requests.api';
import { queryKeys } from '@/lib/queryKeys';
import { invalidateRequestCaches } from '@/lib/queryInvalidation';
import { ROUTES } from '@/lib/constants';
import { toastMutationError } from '@/lib/mutationFeedback';
import { parseApiError } from '@/lib/errorParser';
import { isNetworkLikeFailure } from '@/lib/isNetworkLikeFailure';
import { saveAdDraft, filesToPublishFiles } from '@/lib/offlineAdDrafts';
import { bestEffortCompressPublish } from '@/lib/imageOfflineHelpers';
import { toastOfflineSaved, toastSoftNetworkDraft } from '@/lib/offlinePublishFeedback';
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
    mutationFn: async (input: CreateRequestBody & { files?: File[] }) => {
      operationIdRef.current = newOfflineOperationId();
      // FIX REQ-IMAGE-OFFLINE-01: the mutation now takes the raw File[]
      // alongside the JSON fields, and lets createWithImages run the
      // /media/images upload INSIDE this mutation — so an upload
      // failure lands in onError below (which saves the draft) instead
      // of short-circuiting at the form layer (which used to just
      // toast + return, losing everything).
      const { files, ...body } = input;
      // FIX OFFLINE-QUEUE-RELIABILITY-01: ضغط صور الطلب أوفلاين قبل الرفع
      // FIX TRIPLE-COMPRESS-01: removed the compress-every-File loop
      // that used to run here. Its stated purpose was to keep the
      // queued SW request under the 6MB cap, but the Service Worker
      // never sees this request — it's a cross-origin POST to the
      // backend, so the SW's fetch handler never runs for it. On every
      // offline submit it burned 3-9s compressing images that then
      // went nowhere (the fast-fail interceptor rejected the request
      // immediately after). onError below compresses once, for
      // publishFiles — that single pass is preserved.
      return requestsApi
        .createWithImages(body, files, operationIdRef.current ?? undefined)
        .then((r) => r.data.data);
    },
    onSuccess: (created) => {
      clearActiveOfflineDraftId();
      void invalidateRequestCaches(qc, created?.id);
      toast.success('تم نشر طلبك');
      if (created?.id) router.push(ROUTES.request(created.id));
      else router.push(ROUTES.requests);
    },
    onError: async (err, input) => {
      const parsed = parseApiError(err);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline || isNetworkLikeFailure(parsed)) {
        try {
          const { files, ...body } = input;
          const compressedFiles = files?.length ? await bestEffortCompressPublish(files) : [];
          const publishFiles = compressedFiles.length ? await filesToPublishFiles(compressedFiles) : [];
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
            status: (offline || parsed.queued) ? 'pending_sync' : 'failed',
            lastError: (offline || parsed.queued) ? undefined : parsed.message,
            // FIX LASTERROR-CODE-01: store the machine-readable
            // code + status so the sync center re-translates the
            // message on every render — a frozen Arabic string
            // keeps showing old wording after any i18n update
            // (this is why 'لا تملك صلاحية' kept appearing even
            // after STORE_NOT_ACTIVE was added).
            lastErrorCode: (offline || parsed.queued) ? undefined : parsed.code,
            lastErrorStatus: (offline || parsed.queued) ? undefined : parsed.statusCode,
            userId,
            operationId: operationIdRef.current ?? undefined,
            // FIX REQ-IMAGE-OFFLINE-01: carry the picked File[]s so the
            // Publisher can retry the image upload + create as one unit
            // when connectivity returns. Same publishFiles mechanism that
            // ads/products/services already use.
            publishFiles: publishFiles.length ? publishFiles : undefined,
            publishFilesIncomplete: publishFiles.length !== compressedFiles.length || compressedFiles.length !== (files?.length ?? 0),
            publishRetryCount: 0,
          });
          if (offline || parsed.queued) {
            toastOfflineSaved({
              entity: 'الطلب',
              mode: 'create',
              queuedBySw: Boolean(parsed.queued) && !offline,
            });
          } else {
            toastSoftNetworkDraft({ mode: 'create' });
          }
          return;
        } catch (e) {
          console.error('[offline-drafts] request saveAdDraft failed:', e);
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
      void invalidateRequestCaches(qc, id);
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
      void qc.invalidateQueries({ queryKey: queryKeys.requests.myOffersRoot() });
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
      // FIX WITHDRAW-OFFER-MISSING-INVALIDATION: submitOffer invalidated
      // myOffers() but withdrawOffer did not — so a withdrawn offer kept
      // showing on /my-offers until the page was reloaded or its own
      // staleTime lapsed. Both endpoints mutate the same list, both must
      // invalidate it.
      void qc.invalidateQueries({ queryKey: queryKeys.requests.myOffersRoot() });
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
      void invalidateRequestCaches(qc, id);
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
