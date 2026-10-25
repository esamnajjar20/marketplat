'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { promotionsApi } from '@/api/promotions.api';
import { queryKeys } from '@/lib/queryKeys';
import { invalidateProductBrowseCaches } from '@/lib/queryInvalidation';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import type { CreatePromotionPayload, Promotion, UpdatePromotionPayload } from '@/types/promotion.types';

// PROMO-1: every mutation here also invalidates queryKeys.products —
// a promotion directly changes its product's effectivePrice (see
// product.types.ts), so a stale products.list()/detail() cache would
// keep showing the old price after a promotion is created/cancelled.
// Same "invalidate the whole related prefix" convention
// useAddProductImages already uses for its own cross-cutting effect.

export function useCreatePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreatePromotionPayload) =>
      promotionsApi.create(payload).then((r) => r.data.data),
    onSuccess: (promotion) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promotions.all() });
      void invalidateProductBrowseCaches(queryClient, promotion?.productId
        ? { productId: promotion.productId }
        : { includeAllDetails: true });
      toast.success('تم إنشاء العرض بنجاح');
    },
    onError: toastMutationError,
  });
}

export function useUpdatePromotion(promotionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdatePromotionPayload) =>
      promotionsApi.update(promotionId, payload).then((r) => r.data.data),
    onSuccess: (promotion) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promotions.all() });
      void invalidateProductBrowseCaches(queryClient, promotion?.productId
        ? { productId: promotion.productId }
        : { includeAllDetails: true });
      toast.success('تم حفظ التعديلات');
    },
    onError: toastMutationError,
  });
}

export function useCancelPromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => promotionsApi.cancel(id),
    onSuccess: (_data, promotionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promotions.all() });
      const detail = queryClient.getQueryData<Promotion>(queryKeys.promotions.detail(promotionId));
      const mine = queryClient.getQueryData<Promotion[]>(queryKeys.promotions.mine());
      const productId = detail?.productId ?? mine?.find((promotion) => promotion.id === promotionId)?.productId;
      // DELETE/cancel returns no promotion body. Narrow when cached metadata
      // identifies the product; retain the safe broad fallback if it does not.
      void invalidateProductBrowseCaches(queryClient, productId
        ? { productId }
        : { includeAllDetails: true });
      toast.success('تم إلغاء العرض');
    },
    onError: toastMutationError,
  });
}
