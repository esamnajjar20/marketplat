'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { promotionsApi } from '@/api/promotions.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

/** GET /promotions/me — caller's own store's promotions (my-store promotions tab). */
export function useMyPromotions() {
  return useInfiniteQuery({
    queryKey: queryKeys.promotions.mine(),
    initialPageParam: 1,
    queryFn: async ({ signal, pageParam }) => {
      const response = await promotionsApi.getMine({ page: pageParam, limit: 50 }, { signal });
      const pagination = response.data.meta?.pagination;
      if (!Array.isArray(response.data.data) || !pagination) {
        throw new Error('Invalid promotions response: expected rows and pagination metadata.');
      }
      return { items: response.data.data, pagination };
    },
    getNextPageParam: lastPage =>
      lastPage.pagination.hasNextPage ? (lastPage.pagination.page ?? 1) + 1 : undefined,
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
