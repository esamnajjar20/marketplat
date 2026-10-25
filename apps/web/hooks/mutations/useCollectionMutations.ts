'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionsApi } from '@/api/collections.api';
import { queryKeys } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import type {
  CreateCollectionPayload,
  UpdateCollectionPayload,
  ReorderCollectionsPayload,
} from '@/types/collection.types';

export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCollectionPayload) =>
      collectionsApi.create(payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.mine() });
      toast.success('تم إنشاء المجموعة بنجاح');
    },
    onError: toastMutationError,
  });
}

export function useUpdateCollection(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateCollectionPayload) =>
      collectionsApi.update(id, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.mine() });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.detail(id) });
      toast.success('تم حفظ التعديلات');
    },
    onError: toastMutationError,
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => collectionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.mine() });
      toast.success('تم حذف المجموعة');
    },
    onError: toastMutationError,
  });
}

/** PATCH /collections/reorder — no toast on success; called on every
 * drag/move-button click, an intrusive toast per reorder would be
 * noisy (same reasoning ImageUpload's own reorder gives no toast). */
export function useReorderCollections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ReorderCollectionsPayload) => collectionsApi.reorder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.mine() });
    },
    onError: toastMutationError,
  });
}

/** POST /collections/:id/products/:productId — membership toggle-on.
 * Invalidates the collection's own products.mine() count (product
 * list membership) and the public product list cache for this
 * collection id, so an already-open storefront tab (rare, but a
 * seller may have their own store page open in another tab) refreshes. */
export function useAddProductToCollection(collectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => collectionsApi.addProduct(collectionId, productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.mine() });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.products(collectionId) });
      toast.success('تمت إضافة المنتج إلى المجموعة');
    },
    onError: toastMutationError,
  });
}

export function useRemoveProductFromCollection(collectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => collectionsApi.removeProduct(collectionId, productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.mine() });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.products(collectionId) });
      toast.success('تمت إزالة المنتج من المجموعة');
    },
    onError: toastMutationError,
  });
}
