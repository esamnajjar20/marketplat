'use client';

import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/api/users.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

/** GET /users/:id — disabled until a concrete id is supplied. */
export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => usersApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    enabled: Boolean(id),
  });
}
