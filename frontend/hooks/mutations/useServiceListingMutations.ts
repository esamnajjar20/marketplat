'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { serviceListingsApi } from '@/api/service-listings.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { isNetworkLikeFailure, ONLINE_DRAFT_TOAST } from '@/lib/isNetworkLikeFailure';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';
import { saveAdDraft } from '@/lib/offlineAdDrafts';
import { compressImageForOffline } from '@/lib/imageOffline';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
import {
  getActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';
import { useAuthStore, selectUser } from '@/store/auth.store';
import type {
  CreateServiceListingPayload,
  UpdateServiceListingPayload,
  ServiceListing,
} from '@/types/service.types';
import type { PaginatedResponse } from '@/types/api.types';

/**
 * FIX IMAGEOFFLINE-WIRE-01: يضغط أفضل جهد ممكن — صورة واحدة تفشل لا توقف
 * البقية ولا تمنع حفظ المسودة؛ فقط تُستبعَد من المعاينة.
 */
async function bestEffortCompressPreviews(
  files: File[],
): Promise<{ name: string; blob: Blob }[]> {
  const results = await Promise.allSettled(
    files.slice(0, 4).map(async (f) => ({ name: f.name, blob: await compressImageForOffline(f) })),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{ name: string; blob: Blob }> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/**
 * UX-FIX P3-10b: accepts an optional onUploadProgress callback, same
 * pattern as useCreateAd, so ServiceListingForm can drive a real
 * progress bar in ImageUpload during the multipart upload.
 *
 * Offline: عند انقطاع الشبكة أو وضع الطلب بالطابور، تُحفظ مسودة محلية
 * (kind:'service') بنفس نمط useCreateAd — عنوان + وصف + معاينات مضغوطة
 * تظهر بمركز المزامنة بدل «طلب عام».
 */
export function useCreateServiceListing(onUploadProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const userId = useAuthStore(selectUser)?.id ?? null;
  const operationIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: (payload: CreateServiceListingPayload) => {
      operationIdRef.current = newOfflineOperationId();
      return serviceListingsApi
        .create(payload, onUploadProgress, operationIdRef.current)
        .then((r) => r.data.data);
    },
    onSuccess: () => {
      clearActiveOfflineDraftId();
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() });
      toast.success('تم نشر الخدمة بنجاح');
      router.push(ROUTES.myServices);
    },
    onError: async (err, payload) => {
      const parsed = parseApiError(err);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      // FIX FALSE-OFFLINE-DRAFT-01 + ONLINE-SILENT-DRAFT-01
      if (offline || isNetworkLikeFailure(parsed)) {
        try {
          const files = payload.images ?? [];
          const images = files.length > 0 ? await bestEffortCompressPreviews(files) : [];
          await saveAdDraft({
            id: getActiveOfflineDraftId() ?? undefined,
            mode: 'create',
            kind: 'service',
            payload: {
              title: String(payload.title ?? ''),
              description: String(payload.description ?? ''),
              price: payload.price ?? null,
              categoryId: payload.categoryId ?? null,
              pricingType: payload.pricingType,
              durationEstimate: payload.durationEstimate,
              serviceLocation: payload.serviceLocation,
              imageLabels: files.map((f) => f.name),
            },
            status: offline ? 'pending_sync' : 'failed',
            lastError: offline ? undefined : parsed.message,
            operationId: operationIdRef.current,
            userId,
            images,
          });
          if (offline) {
            toast.message('محفوظ محليًا — بانتظار الاتصال', {
              description:
                'ستُرسل الخدمة تلقائيًا مع الصور عند عودة الاتصال. يمكنك متابعة الحالة من الإعدادات → المزامنة.',
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

export function useUpdateServiceListing(listingId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const userId = useAuthStore(selectUser)?.id ?? null;
  const operationIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: (payload: UpdateServiceListingPayload) => {
      operationIdRef.current = newOfflineOperationId();
      return serviceListingsApi
        .update(listingId, payload, operationIdRef.current)
        .then((r) => r.data.data);
    },
    onSuccess: () => {
      clearActiveOfflineDraftId();
      // Same reasoning as useUpdateAd's I-05 fix: invalidate the whole
      // ['service-listings'] prefix, not just detail+mine, so public
      // browse/search queries don't keep showing stale data.
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() });
      toast.success('تم حفظ التعديلات');
      router.push(ROUTES.myServices);
    },
    onError: async (err, payload) => {
      const parsed = parseApiError(err);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline || isNetworkLikeFailure(parsed)) {
        try {
          await saveAdDraft({
            id: getActiveOfflineDraftId() ?? undefined,
            mode: 'edit',
            kind: 'service',
            remoteAdId: listingId,
            payload: {
              title: String(payload.title ?? ''),
              description: String(payload.description ?? ''),
              price: payload.price ?? null,
              categoryId: payload.categoryId ?? null,
              pricingType: payload.pricingType,
              durationEstimate: payload.durationEstimate,
              serviceLocation: payload.serviceLocation,
              status: payload.status,
            },
            status: offline ? 'pending_sync' : 'failed',
            lastError: offline ? undefined : parsed.message,
            operationId: operationIdRef.current,
            userId,
          });
          if (offline) {
            toast.message('التعديل محفوظ محليًا — بانتظار الاتصال', {
              description: 'سيُرسل تلقائيًا عند عودة الاتصال. الإعدادات → المزامنة.',
            });
          } else {
            toast.message(ONLINE_DRAFT_TOAST.edit.title, {
              description: ONLINE_DRAFT_TOAST.edit.description,
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

/**
 * Gap #3 fix — POST /service-listings/:id/images. Mirrors
 * useAddAdImages exactly: used by ServiceListingForm in edit mode to
 * upload newly-selected files.
 */
export function useAddServiceListingImages(onUploadProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) =>
      serviceListingsApi.addImages(id, files, onUploadProgress).then((r) => r.data.data),
    onSuccess: (_listing, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.detail(id) });
    },
    onError: toastMutationError,
  });
}

/**
 * Gap #3 fix — DELETE /service-listings/:id/images. Mirrors
 * useRemoveAdImage exactly.
 */
export function useRemoveServiceListingImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, imageUrl }: { id: string; imageUrl: string }) =>
      serviceListingsApi.removeImage(id, imageUrl).then((r) => r.data.data),
    onSuccess: (_listing, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.detail(id) });
    },
    onError: toastMutationError,
  });
}

/**
 * Gap #11 — PUT /service-listings/:id/images/reorder. Mirrors
 * useReorderAdImages.
 */
export function useReorderServiceListingImages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, images }: { id: string; images: string[] }) =>
      serviceListingsApi.reorderImages(id, images).then((r) => r.data.data),
    onSuccess: (_listing, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.detail(id) });
    },
    onError: toastMutationError,
  });
}

export function useDeleteServiceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serviceListingsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() });
      toast.success('تم حذف الخدمة');
    },
    onError: toastMutationError,
  });
}

/**
 * EPIC 1.3: pause/resume a listing. The report's finding: PATCH
 * /service-listings/:id already accepts status (including PAUSED) —
 * "the backend PATCH ... does accept status ... it's fully functional
 * server-side, but the frontend's ServiceListingForm.tsx never sends a
 * status field, and MyServiceListingsList.tsx has no 'pause' button."
 * This is that missing button's mutation. Deliberately separate from
 * useUpdateServiceListing above (same endpoint, different UX): that
 * hook redirects to /my-services and shows a generic save toast, both
 * wrong for a one-click toggle fired from a row the user is already
 * looking at. Optimistic update mirrors
 * useToggleServiceCategoryActive's pattern in useServiceCategoryMutations.ts.
 */
export function useToggleServiceListingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'PAUSED' }) =>
      serviceListingsApi.update(id, { status }).then((r) => r.data.data),
    onMutate: async ({ id, status }) => {
      const snapshots = queryClient.getQueriesData<PaginatedResponse<ServiceListing>>({
        queryKey: queryKeys.serviceListings.all(),
      });
      queryClient.setQueriesData<PaginatedResponse<ServiceListing>>(
        { queryKey: queryKeys.serviceListings.all() },
        (old) => {
          if (!old?.items) return old;
          return { ...old, items: old.items.map((l) => (l.id === id ? { ...l, status } : l)) };
        },
      );
      await queryClient.cancelQueries({ queryKey: queryKeys.serviceListings.all() });
      return { snapshots };
    },
    onSuccess: (_data, { status }) =>
      toast.success(status === 'PAUSED' ? 'تم إيقاف الخدمة مؤقتاً' : 'تمت إعادة تفعيل الخدمة'),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() }),
  });
}
