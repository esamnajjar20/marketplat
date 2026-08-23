'use client';

import { useQuery } from '@tanstack/react-query';
import { badgesApi } from '@/api/badges.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

/** GET /badges/store/:storeId — public, no auth. Same TTL as
 * sellerProfile since badges derive from the same rating/verification
 * data that updates about as often. */
export function useStoreBadges(storeId: string) {
  return useQuery({
    queryKey: queryKeys.badges.forStore(storeId),
    queryFn: () => badgesApi.getStoreBadges(storeId).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: Boolean(storeId),
  });
}
