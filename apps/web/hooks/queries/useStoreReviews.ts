'use client';

import { useQuery } from '@tanstack/react-query';
import { storesApi } from '@/api/stores.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { StoreReviewsQuery } from '@/types/store.types';

/** GET /stores/:id/reviews — public, paginated. */
export function useStoreReviews(storeId: string, params?: StoreReviewsQuery) {
  return useQuery({
    queryKey: queryKeys.storeReviews.forStore(storeId, params),
    queryFn: () => storesApi.getReviews(storeId, params).then((r) => r.data.data),
    staleTime: CACHE_TTL.serviceReviews,
    enabled: Boolean(storeId),
  });
}
