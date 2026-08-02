'use client';

import { useQuery } from '@tanstack/react-query';
import { productsApi } from '@/api/products.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { ProductsQuery } from '@/types/product.types';

/** GET /products — public browse/search. */
export function useProducts(params?: ProductsQuery) {
  return useQuery({
    queryKey: queryKeys.products.list(params),
    queryFn: () => productsApi.getAll(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.adsList,
  });
}

/** GET /products/:id — public detail. */
export function useProduct(id: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => productsApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.adDetail,
    enabled: Boolean(id),
  });
}

/** GET /products/me — caller's own products (my-store products tab). */
export function useMyProducts(params?: ProductsQuery) {
  return useQuery({
    queryKey: queryKeys.products.mine(params),
    queryFn: () => productsApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.myAds,
  });
}
