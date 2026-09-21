'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { productsApi } from '@/api/products.api';
import { queryKeys } from '@/lib/queryKeys';
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
import type { CreateProductPayload, UpdateProductPayload, Product } from '@/types/product.types';
import type { PaginatedResponse } from '@/types/api.types';


/**
 * Accepts an optional onUploadProgress callback, same pattern as
 * useCreateServiceListing, so ProductForm can drive a real progress
 * bar in ImageUpload during the multipart upload.
 *
 * Offline: عند انقطاع الشبكة أو وضع الطلب بالطابور، تُحفظ مسودة محلية
 * (kind:'product') بنفس نمط useCreateAd — عنوان + وصف + معاينات مضغوطة
 * تظهر بمركز المزامنة بدل «طلب عام».
 */
export function useCreateProduct(onUploadProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const userId = useAuthStore(selectUser)?.id ?? null;
  const operationIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: async (payload: CreateProductPayload) => {
      operationIdRef.current = newOfflineOperationId();
      // FIX TRIPLE-COMPRESS-01: removed dead compression step (see useAdMutations.ts for full rationale). Compression now runs once, in onError.
      return productsApi
        .create(payload, onUploadProgress, operationIdRef.current)
        .then((r) => r.data.data);
    },
    onSuccess: () => {
      clearActiveOfflineDraftId();
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      toast.success('تم إضافة المنتج بنجاح');
      router.push(ROUTES.myStoreProducts);
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
          await saveAdDraft({
            id: getActiveOfflineDraftId() ?? undefined,
            mode: 'create',
            kind: 'product',
            payload: {
              title: String(payload.name ?? ''),
              name: payload.name,
              description: String(payload.description ?? ''),
              price: payload.price ?? null,
              categoryId: payload.categoryId ?? null,
              discountPrice: payload.discountPrice,
              wholesalePrice: payload.wholesalePrice,
              wholesaleMinQty: payload.wholesaleMinQty,
              availability: payload.availability,
              stockQuantity: payload.stockQuantity,
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
            publishFiles: compressedFiles.length
              ? filesToPublishFiles(compressedFiles)
              : undefined,
            publishRetryCount: 0,
          });
          if (offline || parsed.queued) {
            toastOfflineSaved({
              entity: 'المنتج',
              mode: 'create',
              queuedBySw: Boolean(parsed.queued) && !offline,
            });
          } else {
            toastSoftNetworkDraft({ mode: 'create' });
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

export function useUpdateProduct(productId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const userId = useAuthStore(selectUser)?.id ?? null;
  const operationIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: (payload: UpdateProductPayload) => {
      operationIdRef.current = newOfflineOperationId();
      return productsApi
        .update(productId, payload, operationIdRef.current)
        .then((r) => r.data.data);
    },
    onSuccess: () => {
      clearActiveOfflineDraftId();
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      toast.success('تم حفظ التعديلات');
      router.push(ROUTES.myStoreProducts);
    },
    onError: async (err, payload) => {
      const parsed = parseApiError(err);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline || isNetworkLikeFailure(parsed)) {
        try {
          await saveAdDraft({
            id: getActiveOfflineDraftId() ?? undefined,
            mode: 'edit',
            kind: 'product',
            remoteAdId: productId,
            payload: {
              title: String(payload.name ?? ''),
              name: payload.name,
              description: String(payload.description ?? ''),
              price: payload.price ?? null,
              categoryId: payload.categoryId ?? null,
              discountPrice: payload.discountPrice,
              wholesalePrice: payload.wholesalePrice,
              wholesaleMinQty: payload.wholesaleMinQty,
              availability: payload.availability,
              stockQuantity: payload.stockQuantity,
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
              entity: 'المنتج',
              mode: 'edit',
              queuedBySw: Boolean(parsed.queued) && !offline,
            });
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
 * Gap #3 fix — POST /products/:id/images. Mirrors useAddAdImages
 * exactly: used by ProductForm in edit mode to upload newly-selected
 * files, invalidates the whole ['products'] prefix (not just
 * detail+mine) so public browse/search caches don't keep serving a
 * stale image set.
 */
export function useAddProductImages(onUploadProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) =>
      productsApi.addImages(id, files, onUploadProgress).then((r) => r.data.data),
    onSuccess: (_product, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
    },
    onError: toastMutationError,
  });
}

/**
 * Gap #3 fix — DELETE /products/:id/images. Mirrors useRemoveAdImage
 * exactly.
 */
export function useRemoveProductImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, imageUrl }: { id: string; imageUrl: string }) =>
      productsApi.removeImage(id, imageUrl).then((r) => r.data.data),
    onSuccess: (_product, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
    },
    onError: toastMutationError,
  });
}

/**
 * Gap #11 — PUT /products/:id/images/reorder. Mirrors useReorderAdImages.
 */
export function useReorderProductImages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, images }: { id: string; images: string[] }) =>
      productsApi.reorderImages(id, images).then((r) => r.data.data),
    onSuccess: (_product, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
    },
    onError: toastMutationError,
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      toast.success('تم حذف المنتج');
    },
    onError: toastMutationError,
  });
}

/**
 * Pause/resume a product. PATCH /products/:id already accepts status —
 * this is the one-click toggle mutation for a row the user is already
 * looking at, same shape as useToggleServiceListingStatus (optimistic
 * update + rollback on error).
 */
export function useToggleProductStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'PAUSED' }) =>
      productsApi.update(id, { status }).then((r) => r.data.data),
    onMutate: async ({ id, status }) => {
      const snapshots = queryClient.getQueriesData<PaginatedResponse<Product>>({
        queryKey: queryKeys.products.all(),
      });
      // setQueriesData targets a prefix key that can match several distinct
      // cache shapes (.list()/.mine()/.detail()); PaginatedResponse<Product>
      // covers the list shapes this toggle actually touches; other matched
      // shapes are left untouched via the `old?.items` guard below.
      queryClient.setQueriesData<PaginatedResponse<Product>>(
        { queryKey: queryKeys.products.all() },
        (old) => {
          if (!old?.items) return old;
          return { ...old, items: old.items.map((p) => (p.id === id ? { ...p, status } : p)) };
        },
      );
      await queryClient.cancelQueries({ queryKey: queryKeys.products.all() });
      return { snapshots };
    },
    onSuccess: (_data, { status }) =>
      toast.success(status === 'PAUSED' ? 'تم إيقاف المنتج مؤقتاً' : 'تمت إعادة تفعيل المنتج'),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all() }),
  });
}
