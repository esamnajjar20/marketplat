'use client';

import { useQuery } from '@tanstack/react-query';
import { activityApi } from '@/api/activity.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import type { ActivityQuery } from '@/types/activity.types';

/** GET /activity — powers the /activity page's Timeline. Returns the
 * unwrapped { items, meta } shape (see lib/apiPagination.ts), so
 * callers get both the rows and pagination info off `.data`. */
export function useMyActivity(params?: ActivityQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.activity.mine(params),
    queryFn: () => activityApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.activity,
    enabled: isAuthenticated,
  });
}
