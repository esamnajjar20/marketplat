'use client';

import { useQuery } from '@tanstack/react-query';
import { savedSearchesApi } from '@/api/savedSearches.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

/** GET /saved-searches — the current user's saved searches. */
export function useSavedSearches() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.savedSearches.all(),
    queryFn: () => savedSearchesApi.getAll(),
    staleTime: CACHE_TTL.savedSearches,
    enabled: isAuthenticated,
  });
}
