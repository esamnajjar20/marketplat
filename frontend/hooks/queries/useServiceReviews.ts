'use client';

import { useQuery } from '@tanstack/react-query';
import { serviceReviewsApi } from '@/api/service-reviews.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

/**
 * GET /service-reviews/seller/:sellerProfileId — public, paginated.
 * Epic 3.2/3.3: was previously a fully-built API client with zero
 * hooks and zero UI (services.api.ts's create/getForSeller matched the
 * backend exactly but nothing ever called them).
 */
export function useServiceReviewsForSeller(
  sellerProfileId: string,
  params?: { page?: number; limit?: number }
) {
  return useQuery({
    queryKey: queryKeys.serviceReviews.forSeller(sellerProfileId, params),
    queryFn: () => serviceReviewsApi.getForSeller(sellerProfileId, params).then((r) => r.data.data),
    staleTime: CACHE_TTL.serviceReviews,
    enabled: Boolean(sellerProfileId),
  });
}
