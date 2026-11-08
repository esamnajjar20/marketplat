'use client';

import { useQuery } from '@tanstack/react-query';
import { storiesApi } from '@/api/stories.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated, selectHasAccessToken } from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function useStoryFeed() {
  const authenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const online = useOnlineStatus();
  return useQuery({
    queryKey: queryKeys.stories.feed(),
    queryFn: ({ signal }) => storiesApi.feed({ signal }).then((r) => r.data.data),
    staleTime: 60_000,
    enabled: authenticated && hasToken && online,
  });
}

export function useUserStories(userId: string, enabled = true) {
  const authenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const online = useOnlineStatus();
  return useQuery({
    queryKey: queryKeys.stories.user(userId),
    queryFn: ({ signal }) => storiesApi.userStories(userId, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    enabled: enabled && authenticated && hasToken && online && Boolean(userId),
  });
}

export function useStoryViewers(storyId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.stories.viewers(storyId),
    queryFn: ({ signal }) => storiesApi.viewers(storyId, { signal }).then((r) => r.data.data),
    staleTime: 10_000,
    enabled: Boolean(storyId) && enabled,
  });
}
