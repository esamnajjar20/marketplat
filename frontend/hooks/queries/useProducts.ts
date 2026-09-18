'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { productsApi } from '@/api/products.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { ProductsQuery, ProductWithStore } from '@/types/product.types';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

type ProductsPage = {
  items: ProductWithStore[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

function offlinePage(items: ProductWithStore[]): ProductsPage {
  return {
    items,
    meta: {
      total: items.length,
      page: 1,
      limit: items.length || 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

/** GET /products — public browse/search. */
export function useProducts(params?: ProductsQuery, options?: { enabled?: boolean }) {
  const isBaseBrowse =
    (!params?.page || params.page === 1) &&
    !params?.search &&
    !params?.categoryId &&
    !params?.storeId;
  const cached = isBaseBrowse
    ? getOfflineList<ProductWithStore>(OFFLINE_LIST_KEYS.productsBrowse)
    : null;

  return useQuery({
    queryKey: queryKeys.products.list(params),
    queryFn: async (): Promise<ProductsPage> => {
      try {
        const data = (await productsApi.getAll(params).then((r) => r.data.data)) as ProductsPage;
        if (isBaseBrowse && data?.items?.length) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.productsBrowse,
            data.items,
            OFFLINE_LIST_LIMITS.productsBrowse,
          );
        }
        return data;
      } catch (err) {
        if (isBaseBrowse) {
          const local = getOfflineList<ProductWithStore>(OFFLINE_LIST_KEYS.productsBrowse);
          if (local?.items?.length) return offlinePage(local.items);
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.adsList,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
    ...(cached?.items?.length
      ? {
          initialData: offlinePage(cached.items),
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
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
    placeholderData: keepPreviousData,
  });
}
