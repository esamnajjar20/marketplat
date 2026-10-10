'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { serviceListingsApi } from '@/api/service-listings.api';
import { queryKeys } from '@/lib/queryKeys';
import { invalidateServiceListingCaches } from '@/lib/queryInvalidation';
import { parseApiError } from '@/lib/errorParser';
import { isNetworkLikeFailure } from '@/lib/isNetworkLikeFailure';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';
import { saveAdDraft, filesToPublishFiles } from '@/lib/offlineAdDrafts';
import { toastOfflineSaved, toastSoftNetworkDraft } from '@/lib/offlinePublishFeedback';
import { bestEffortCompressPublish, bestEffortCompressPreviews } from '@/lib/imageOfflineHelpers';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
import {
  getActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';
import { useAuthStore, selectUser } from '@/store/auth.store';
import type {
  CreateServiceListingPayload,
  UpdateServiceListingPayload,
} from '@/types/service.types';


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
    mutationFn: async (payload: CreateServiceListingPayload) => {
      operationIdRef.current = newOfflineOperationId();
      // FIX TRIPLE-COMPRESS-01: removed dead compression step (see useAdMutations.ts for full rationale). Compression now runs once, in onError.
      return serviceListingsApi
        .create(payload, onUploadProgress, operationIdRef.current)
        .then((r) => r.data.data);
    },
    onSuccess: () => {
      clearActiveOfflineDraftId();
      void invalidateServiceListingCaches(queryClient);
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
          // FIX TRIPLE-COMPRESS-01: compress ONCE, reuse for both
          // previews and publishFiles (see useAdMutations.ts for the
          // full rationale — the duplicated pass was what made the form
          // appear frozen at "جاري رفع الصور… 0%" on offline submit).
          const compressedFiles =
            files.length > 0 ? await bestEffortCompressPublish(files) : [];
          const images =
            compressedFiles.length > 0
              ? await bestEffortCompressPreviews(compressedFiles)
              : [];
          const publishFiles = compressedFiles.length ? await filesToPublishFiles(compressedFiles) : [];
          await saveAdDraft({
            id: getActiveOfflineDraftId() ?? undefined,
            mode: 'create',
            kind: 'service',
            payload: {
              title: String(payload.title ?? ''),
              description: String(payload.description ?? ''),
              price: payload.price ?? null,
              serviceTypeId: payload.serviceTypeId ?? null,
              categoryId: payload.categoryId ?? null,
              pricingType: payload.pricingType,
              durationEstimate: payload.durationEstimate,
              attributes: payload.attributes,
              serviceLocation: payload.serviceLocation,
              imageLabels: files.map((f) => f.name),
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
            operationId: operationIdRef.current,
            userId,
            images,
            publishFiles: publishFiles.length ? publishFiles : undefined,
            publishFilesIncomplete: publishFiles.length !== compressedFiles.length || compressedFiles.length !== files.length,
            publishRetryCount: 0,
          });
          if (offline || parsed.queued) {
            toastOfflineSaved({
              entity: 'الخدمة',
              mode: 'create',
              queuedBySw: Boolean(parsed.queued) && !offline,
            });
            router.push(ROUTES.myServices);
          } else {
            toastSoftNetworkDraft({ mode: 'create' });
          }
          return;
        } catch (e) {
          console.error('[offline-drafts] service saveAdDraft failed:', e);
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
      void invalidateServiceListingCaches(queryClient, listingId);
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
              serviceTypeId: payload.serviceTypeId ?? null,
              categoryId: payload.categoryId ?? null,
              pricingType: payload.pricingType,
              durationEstimate: payload.durationEstimate,
              attributes: payload.attributes,
              serviceLocation: payload.serviceLocation,
              status: payload.status,
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
            operationId: operationIdRef.current,
            userId,
          });
          if (offline || parsed.queued) {
            toastOfflineSaved({
              entity: 'الخدمة',
              mode: 'edit',
              queuedBySw: Boolean(parsed.queued) && !offline,
            });
            router.push(ROUTES.myServices);
          } else {
            toastSoftNetworkDraft({ mode: 'edit' });
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
    onSuccess: (_data, variables) => {
      void invalidateServiceListingCaches(queryClient, variables.id);
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
    onSuccess: (_data, variables) => {
      void invalidateServiceListingCaches(queryClient, variables.id);
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
    onSuccess: (_data, variables) => {
      void invalidateServiceListingCaches(queryClient, variables.id);
    },
    onError: toastMutationError,
  });
}

export function useDeleteServiceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serviceListingsApi.delete(id),
    onSuccess: (_data, listingId) => {
      void invalidateServiceListingCaches(queryClient, listingId);
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
function findServiceListingStatusInCache(value: unknown, listingId: string): 'ACTIVE' | 'PAUSED' | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findServiceListingStatusInCache(item, listingId);
      if (found) return found;
    }
    return undefined;
  }
  if (value === null || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.id === listingId && (record.status === 'ACTIVE' || record.status === 'PAUSED')) return record.status;
  for (const child of Object.values(record)) {
    const found = findServiceListingStatusInCache(child, listingId);
    if (found) return found;
  }
  return undefined;
}

function updateServiceListingStatusInCache<T>(value: T, listingId: string, status: 'ACTIVE' | 'PAUSED'): T {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const updated = updateServiceListingStatusInCache(item, listingId, status);
      if (updated !== item) changed = true;
      return updated;
    });
    return (changed ? next : value) as T;
  }
  if (value === null || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const matches = record.id === listingId && record.status !== status;
  let changed = matches;
  const next: Record<string, unknown> = { ...record };
  for (const [key, child] of Object.entries(record)) {
    const updated = updateServiceListingStatusInCache(child, listingId, status);
    if (updated !== child) {
      changed = true;
      next[key] = updated;
    }
  }
  if (!changed) return value;
  if (matches) next.status = status;
  return next as T;
}

function isServiceListingBrowseCacheKey(key: readonly unknown[]): boolean {
  return key[0] === 'service-listings' &&
    ['list', 'infinite', 'me', 'detail'].includes(String(key[1] ?? ''));
}

export function useToggleServiceListingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['service-listing-status'],
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'PAUSED' }) =>
      serviceListingsApi.update(id, { status }).then((r) => r.data.data),
    onMutate: async ({ id, status }) => {
      // Cancel every service-listing request before touching cache so a stale
      // list, infinite page, or detail response cannot overwrite the toggle.
      await queryClient.cancelQueries({ queryKey: queryKeys.serviceListings.all() });
      const snapshots = queryClient
        .getQueriesData<unknown>({ queryKey: queryKeys.serviceListings.all() })
        .filter(([key]) => isServiceListingBrowseCacheKey(key));
      for (const [key, data] of snapshots) {
        queryClient.setQueryData(key, updateServiceListingStatusInCache(data, id, status));
      }
      const previousStatus = snapshots
        .map(([, data]) => data)
        .map((data) => findServiceListingStatusInCache(data, id))
        .find((value): value is 'ACTIVE' | 'PAUSED' => value !== undefined);
      return { previousStatus };
    },
    onSuccess: (_data, { status }) =>
      toast.success(status === 'PAUSED' ? 'تم إيقاف الخدمة مؤقتاً' : 'تمت إعادة تفعيل الخدمة'),
    onError: (err, variables, context) => {
      const anotherToggleForSameListingIsPending = queryClient.isMutating({
        predicate: (mutation) =>
          mutation.options.mutationKey?.[0] === 'service-listing-status' &&
          (mutation.state.variables as { id?: string } | undefined)?.id === variables.id,
      }) > 1;
      // Restore only the failed listing's previous status. Replacing whole
      // paginated snapshots here could discard concurrent optimistic changes
      // to other listings in the same cached page.
      if (!anotherToggleForSameListingIsPending && context?.previousStatus !== undefined) {
        // Roll back only this listing in every affected cache; restoring full
        // snapshots could erase unrelated concurrent cache updates.
        const caches = queryClient.getQueriesData<unknown>({ queryKey: queryKeys.serviceListings.all() })
          .filter(([key]) => isServiceListingBrowseCacheKey(key));
        for (const [key, data] of caches) {
          queryClient.setQueryData(key, updateServiceListingStatusInCache(data, variables.id, context.previousStatus));
        }
      }
      toast.error(parseApiError(err).message);
    },
    onSettled: (_data, _error, variables) => invalidateServiceListingCaches(queryClient, variables?.id),
  });
}
