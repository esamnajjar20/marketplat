'use client';

import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/api/users.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated, selectHasAccessToken } from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/** GET /users/:id — disabled until a concrete id is supplied. */
export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: ({ signal }) => usersApi.getById(id, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    enabled: Boolean(id),
  });
}


/**
 * Combines the two viewer-specific requests used by a public profile header
 * (follow status + online presence). Cache is partitioned by viewer id so a
 * signed-in user's state can never leak to another account.
 */
export function useProfileInteractionState(profileUserId: string, enabled = true) {
  const viewerId = useAuthStore((state) => state.user?.id ?? null);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const isOwnProfile = Boolean(viewerId && viewerId === profileUserId);

  return useQuery({
    queryKey: queryKeys.users.profileState(profileUserId, viewerId ?? 'anonymous'),
    queryFn: ({ signal }) => usersApi.getProfileInteractionState(profileUserId, { signal })
      .then((response) => response.data.data),
    staleTime: CACHE_TTL.presence,
    refetchOnWindowFocus: false,
    enabled: enabled && Boolean(profileUserId) && isAuthenticated && !isOwnProfile && (hasToken || !isOnline),
  });
}
