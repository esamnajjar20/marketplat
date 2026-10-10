'use client';

import { useQuery } from '@tanstack/react-query';
import { collectionsApi } from '@/api/collections.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated, selectHasAccessToken, selectIsAuthResolving } from '@/store/auth.store';

/** GET /collections/me — caller's own store's collections (my-store collections tab). */
export function useMyCollections(options?: { enabled?: boolean }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasAccessToken = useAuthStore(selectHasAccessToken);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);

  return useQuery({
    queryKey: queryKeys.collections.mine(),
    queryFn: () => collectionsApi.getMine().then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.myAds,
    enabled: (options?.enabled ?? true) && isAuthenticated && hasAccessToken && !isAuthResolving,
  });
}

/** GET /collections/:id — owner-only single read (edit form). */
export function useCollection(id: string) {
  return useQuery({
    queryKey: queryKeys.collections.detail(id),
    queryFn: () => collectionsApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.myAds,
    enabled: Boolean(id),
  });
}

/** GET /collections/store/:storeId — public storefront tab, active collections only. */
export function usePublicCollections(storeId: string) {
  return useQuery({
    queryKey: queryKeys.collections.forStore(storeId),
    queryFn: () => collectionsApi.getPublicCollections(storeId).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: Boolean(storeId),
  });
}

/** GET /collections/:id/products — public, active products only. */
export function useCollectionProducts(id: string) {
  return useQuery({
    queryKey: queryKeys.collections.products(id),
    queryFn: () => collectionsApi.getPublicCollectionProducts(id).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: Boolean(id),
  });
}
