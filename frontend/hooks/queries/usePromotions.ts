'use client';

import { useQuery } from '@tanstack/react-query';
import { promotionsApi } from '@/api/promotions.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

/** GET /promotions/me — caller's own store's promotions (my-store promotions tab). */
export function useMyPromotions() {
  return useQuery({
    queryKey: queryKeys.promotions.mine(),
    queryFn: ({ signal }) => promotionsApi.getMine({ signal }).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.myAds,
  });
}

export function usePromotion(id: string) {
  return useQuery({
    queryKey: queryKeys.promotions.detail(id),
    queryFn: ({ signal }) => promotionsApi.getById(id, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.myAds,
    enabled: Boolean(id),
  });
}
