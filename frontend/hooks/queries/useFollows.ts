'use client';

import { useQuery } from '@tanstack/react-query';
import { followsApi, type FollowTargetType } from '@/api/follows.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated, selectHasAccessToken } from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function useFollowStatus(
  targetType: FollowTargetType,
  targetId: string,
  options: { enabled?: boolean } = {},
) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const isOnline = useOnlineStatus();
  return useQuery({
    queryKey: queryKeys.follows.status(targetType, targetId),
    queryFn: ({ signal }) => followsApi.status(targetType, targetId, { signal }).then((r) => r.data.data?.following ?? false),
    staleTime: CACHE_TTL.favorites,
    // Following yourself is not a meaningful state; guard it here so every
    // consumer (not just the public profile button) avoids that request.
    enabled: (options.enabled ?? true) && !(targetType === 'USER' && currentUserId === targetId) &&
      isAuthenticated && Boolean(targetId) && (hasToken || !isOnline),
  });
}

export function useMyFollowing(params?: Parameters<typeof followsApi.myFollowing>[0]) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  return useQuery({
    queryKey: queryKeys.follows.my(params),
    queryFn: ({ signal }) => followsApi.myFollowing(params, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated && (hasToken || !isOnline),
  });
}

export function useUserFollowers(id: string, params?: Parameters<typeof followsApi.userFollowers>[1]) {
  return useQuery({
    queryKey: queryKeys.follows.followers('USER', id, params),
    queryFn: ({ signal }) => followsApi.userFollowers(id, params, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    enabled: Boolean(id),
  });
}

export function useUserFollowing(id: string, params?: Parameters<typeof followsApi.userFollowing>[1]) {
  return useQuery({
    queryKey: queryKeys.follows.following('USER', id, params),
    queryFn: ({ signal }) => followsApi.userFollowing(id, params, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    enabled: Boolean(id),
  });
}

export function useFollowingFeed(params?: Parameters<typeof followsApi.feed>[0]) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  return useQuery({
    queryKey: queryKeys.follows.feed(params),
    queryFn: ({ signal }) => followsApi.feed(params, { signal }).then((r) => r.data.data),
    staleTime: 120_000,
    enabled: isAuthenticated,
  });
}
