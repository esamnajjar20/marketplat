'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sellersApi } from '@/api/sellers.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type { CreateSellerProfilePayload, CreateSellerRatingPayload } from '@/types/seller.types';

/**
 * POST /sellers/me/profile — one-time seller profile creation.
 * On success, invalidates the "my profile" query so useMySellerProfile()
 * picks up the new profile instead of continuing to show the
 * become-a-seller CTA.
 */
export function useCreateSellerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateSellerProfilePayload) =>
      sellersApi.createMyProfile(payload).then(r => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellers.me() });
      toast.success('تم إنشاء ملفك كبائع بنجاح');
    },
    onError: err => toast.error(parseApiError(err).message),
  });
}

/**
 * POST /sellers/:id/ratings. Invalidates the target seller's public
 * profile so the new averageRating/totalRatings show up without a
 * manual refresh.
 */
export function useCreateSellerRating(sellerProfileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateSellerRatingPayload) =>
      sellersApi.createRating(sellerProfileId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellers.detail(sellerProfileId) });
      toast.success('تم إرسال تقييمك');
    },
    onError: err => toast.error(parseApiError(err).message),
  });
}
