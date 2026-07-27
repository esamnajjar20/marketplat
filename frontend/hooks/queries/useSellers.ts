'use client';

import { useQuery } from '@tanstack/react-query';
import { sellersApi } from '@/api/sellers.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

/** GET /sellers/:id — public seller page. No auth required. */
export function useSellerProfile(id: string) {
  return useQuery({
    queryKey: queryKeys.sellers.detail(id),
    queryFn: () => sellersApi.getById(id).then(r => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: Boolean(id),
  });
}

/**
 * GET /sellers/me/profile — the caller's own seller profile.
 * A 404 here just means "not a seller yet", not an error state — every
 * caller of this hook should treat `isError` (with no profile) as
 * "show a become-a-seller CTA", not as a failure to surface.
 */
export function useMySellerProfile() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.sellers.me(),
    queryFn: () => sellersApi.getMyProfile().then(r => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated,
    retry: false,
  });
}
