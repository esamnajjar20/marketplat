'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { productsApi } from '@/api/products.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';
import type { CreateProductPayload, UpdateProductPayload } from '@/types/product.types';

/**
 * Accepts an optional onUploadProgress callback, same pattern as
 * useCreateServiceListing, so ProductForm can drive a real progress
 * bar in ImageUpload during the multipart upload.
 */
export function useCreateProduct(onUploadProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (payload: CreateProductPayload) =>
      productsApi.create(payload, onUploadProgress).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      toast.success('تم إضافة المنتج بنجاح');
      router.push(ROUTES.myStoreProducts);
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useUpdateProduct(productId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (payload: UpdateProductPayload) =>
      productsApi.update(productId, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      toast.success('تم حفظ التعديلات');
      router.push(ROUTES.myStoreProducts);
    },
    onError: (err) => toast.error(parseApiError(err).message),
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
    onError: (err) => toast.error(parseApiError(err).message),
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
    onError: (err) => toast.error(parseApiError(err).message),
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
    onError: (err) => toast.error(parseApiError(err).message),
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
    onError: (err) => toast.error(parseApiError(err).message),
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
      const snapshots = queryClient.getQueriesData({ queryKey: queryKeys.products.all() });
      queryClient.setQueriesData({ queryKey: queryKeys.products.all() }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((p: any) => (p.id === id ? { ...p, status } : p)) };
      });
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
