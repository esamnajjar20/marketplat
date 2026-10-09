'use client';

import { useQuery } from '@tanstack/react-query';
import { favoriteListsApi } from '@/api/favorite-lists.api';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { CACHE_TTL } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';

export const favoriteListsQueryKey = queryKeys.favorites.lists();

export function useFavoriteLists() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.favorites.lists(),
    queryFn: () => favoriteListsApi.list(),
    // FIX FAV-LISTS-TTL-CLEANUP-01: was CACHE_TTL.favorites ?? 60_000.
    // CACHE_TTL.favorites is a real constant; the ?? could only fire if
    // someone renamed/deleted it, at which point falling back to a
    // DIFFERENT semantic value (a literal 60_000) would silently mask
    // the mistake. Same cleanup as the adminList and
    // conversationUnreadCount ?? removals.
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated && (hasToken || !isOnline),
  });
}
