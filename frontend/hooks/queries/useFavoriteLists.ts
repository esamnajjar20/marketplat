'use client';

import { useQuery } from '@tanstack/react-query';
import { favoriteListsApi } from '@/api/favorite-lists.api';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { CACHE_TTL } from '@/lib/constants';

export const favoriteListsQueryKey = ['favorites', 'lists'] as const;

export function useFavoriteLists() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: favoriteListsQueryKey,
    queryFn: () => favoriteListsApi.list(),
    staleTime: CACHE_TTL.favorites ?? 60_000,
    enabled: isAuthenticated,
  });
}
