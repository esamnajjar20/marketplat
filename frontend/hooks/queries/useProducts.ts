'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useOfflineListSeed } from '@/lib/useOfflineListSeed';
import { productsApi } from '@/api/products.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { ProductsQuery, Product, ProductWithStore } from '@/types/product.types';
import type { PaginationMeta } from '@/types/api.types';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

type ProductsPage = { items: ProductWithStore[]; meta: PaginationMeta };
type MyProductsPage = { items: Product[]; meta: PaginationMeta };

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
  // FIX PRODUCTS-OFFLINE-CACHE-SCOPE-01: the isBaseBrowse check
  // only listed page/search/categoryId/storeId, but ProductsQuery
  // (types/product.types.ts) also carries city, availability,
  // minPrice, maxPrice, and hasPromotion — any of which changes the
  // result set. A price-filtered, city-filtered, or promotion-only
  // first page (?hasPromotion=true, page 1) was being written into
  // the generic productsBrowse offline slot, so a later unfiltered
  // offline open of /products served that subset back to the user.
  // Same class as ADS-OFFLINE-CACHE-SCOPE-01/-02 and
  // APPT-OFFLINE-CACHE-SCOPE-01. sortBy/sortOrder stay excluded
  // (they reorder the same set, not filter it).
  const isBaseBrowse =
    (!params?.page || params.page === 1) &&
    params?.limit === undefined &&
    !params?.search &&
    !params?.categoryId &&
    !params?.storeId &&
    !params?.city &&
    !params?.availability &&
    params?.minPrice === undefined &&
    params?.maxPrice === undefined &&
    params?.hasPromotion === undefined;
  const queryKey = queryKeys.products.list(params);
  useOfflineListSeed<ProductWithStore, ProductsPage>({
    queryKey,
    cacheKey: OFFLINE_LIST_KEYS.productsBrowse,
    enabled: isBaseBrowse && (options?.enabled ?? true),
    mapItems: offlinePage,
  });

  return useQuery<ProductsPage>({
    queryKey,
    queryFn: async ({ signal }): Promise<ProductsPage> => {
      try {
        const data = (await productsApi.getAll(params, { signal }).then((r) => r.data.data)) as ProductsPage;
        if (isBaseBrowse && Array.isArray(data?.items)) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.productsBrowse,
            data.items,
            OFFLINE_LIST_LIMITS.productsBrowse,
          );
        }
        return data;
      } catch (err) {
        if (signal.aborted || (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'ERR_CANCELED')) throw err;
        if (isBaseBrowse) {
          const local = getOfflineList<ProductWithStore>(OFFLINE_LIST_KEYS.productsBrowse);
          if (local) return offlinePage(local.items);
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.adsList,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

/** GET /products/:id — public detail. */
export function useProduct(id: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: ({ signal }) => productsApi.getById(id, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.adDetail,
    enabled: Boolean(id),
  });
}

/** GET /products/me — caller's own products (my-store products tab). */
export function useMyProducts(params?: ProductsQuery, options?: { enabled?: boolean }) {
  return useQuery<MyProductsPage>({
    queryKey: queryKeys.products.mine(params),
    queryFn: ({ signal }) => productsApi.getMine(params, { signal }).then((r) => r.data.data as MyProductsPage),
    staleTime: CACHE_TTL.myAds,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}
