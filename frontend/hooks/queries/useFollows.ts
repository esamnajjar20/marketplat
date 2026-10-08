'use client';

import { useQuery } from '@tanstack/react-query';
import { followsApi, type FollowTargetType } from '@/api/follows.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated, selectHasAccessToken } from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function useFollowStatus(targetType: FollowTargetType, targetId: string) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  return useQuery({
    queryKey: queryKeys.follows.status(targetType, targetId),
    queryFn: () => followsApi.status(targetType, targetId).then((r) => r.data.data?.following ?? false),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated && Boolean(targetId) && (hasToken || !isOnline),
  });
}

export function useMyFollowing(params?: { type?: FollowTargetType; page?: number; limit?: number }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  return useQuery({
    queryKey: queryKeys.follows.my(params),
    queryFn: () => followsApi.myFollowing(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated && (hasToken || !isOnline),
  });
}

export function useUserFollowers(id: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.follows.followers('USER', id, params),
    queryFn: () => followsApi.userFollowers(id, params).then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    enabled: Boolean(id),
  });
}

export function useUserFollowing(id: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.follows.following('USER', id, params),
    queryFn: () => followsApi.userFollowing(id, params).then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    enabled: Boolean(id),
  });
}

export function useFollowingFeed(params?: { page?: number; limit?: number }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  return useQuery({
    queryKey: queryKeys.follows.feed(params),
    queryFn: () => followsApi.feed(params).then((r) => r.data.data),
    staleTime: 30_000,
    enabled: isAuthenticated,
  });
}
