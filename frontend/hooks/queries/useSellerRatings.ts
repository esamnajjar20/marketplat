'use client';

import { useQuery } from '@tanstack/react-query';
import { sellersApi } from '@/api/sellers.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

/**
 * GET /sellers/:id/ratings — public, paginated.
 * TRACK-AD-RATINGS-LIST: mirrors useServiceReviewsForSeller /
 * useStoreReviews exactly, including reusing CACHE_TTL.serviceReviews
 * (append-only content, same staleness tolerance as those two — see
 * that constant's own comment) rather than adding a redundant
 * near-identical TTL just for this one hook.
 */
export function useSellerRatings(
  sellerProfileId: string,
  params?: Parameters<typeof sellersApi.getRatings>[1]
) {
  return useQuery({
    queryKey: queryKeys.sellers.ratings(sellerProfileId, params),
    queryFn: () => sellersApi.getRatings(sellerProfileId, params).then((r) => r.data.data),
    staleTime: CACHE_TTL.serviceReviews,
    enabled: Boolean(sellerProfileId),
  });
}
