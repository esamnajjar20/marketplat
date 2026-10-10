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
    queryFn: () => storiesApi.feed().then((r) => r.data.data),
    staleTime: 60_000,
    enabled: authenticated && hasToken && online,
  });
}

export function useUserStories(userId: string) {
  const authenticated = useAuthStore(selectIsAuthenticated);
  return useQuery({
    queryKey: queryKeys.stories.user(userId),
    queryFn: () => storiesApi.userStories(userId).then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    enabled: authenticated && Boolean(userId),
  });
}

export function useStoryViewers(storyId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.stories.viewers(storyId),
    queryFn: () => storiesApi.viewers(storyId).then((r) => r.data.data),
    staleTime: 10_000,
    enabled: Boolean(storyId) && enabled,
  });
}
