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
    // FIX FAV-LISTS-TTL-CLEANUP-01: was CACHE_TTL.favorites ?? 60_000.
    // CACHE_TTL.favorites is a real constant; the ?? could only fire if
    // someone renamed/deleted it, at which point falling back to a
    // DIFFERENT semantic value (a literal 60_000) would silently mask
    // the mistake. Same cleanup as the adminList and
    // conversationUnreadCount ?? removals.
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated,
  });
}
