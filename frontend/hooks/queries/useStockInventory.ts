'use client';

import { useQuery } from '@tanstack/react-query';
import { getStockHistory, getStockSummary } from '@/api/products-stock.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

export function useStockSummary() {
  return useQuery({
    queryKey: queryKeys.products.stockSummary(),
    queryFn: getStockSummary,
    staleTime: CACHE_TTL.myAds,
  });
}

export function useStockHistory(params?: { page?: number; limit?: number; productId?: string }) {
  return useQuery({
    queryKey: queryKeys.products.stockHistory(params),
    queryFn: () => getStockHistory(params),
    staleTime: CACHE_TTL.myAds,
  });
}
