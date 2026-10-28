'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { blockedUsersApi } from '@/api/blocked-users.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { BlockedUsersQuery } from '@/types/blocked-user.types';
import { useQueryIdSetMembership } from '@/hooks/queries/sharedIdSetStore';

/**
 * GET /blocked-users — the caller's blocked users, paginated.
 *
 * Also mirrors this page's rows into the shared blockedUsers.ids() Set
 * as a side effect after the query settles, same as
 * useMyFollowedStores does for queryKeys.stores.followedIds() — that
 * Set is what useIsUserBlocked() below reads reactively, since there's
 * no single GET /blocked-users/:userId/status endpoint.
 */
export function useMyBlockedUsers(params?: BlockedUsersQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.blockedUsers.all(params),
    queryFn: () => blockedUsersApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated && (hasToken || !isOnline),
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;

    // FIX BLOCKED-USERS-EFFECT-GUARD-01: same guard useFavorites already
    // has (FAVORITES-EFFECT-RERENDER). Without the early-return, every
    // background refetch that returns the same page of blocked users
    // built a brand-new Set, which re-rendered every subscriber of
    // useIsUserBlocked() -- one per chat header / profile action in the
    // tree. Compare first, allocate only when there's actually a new id.
    const newIds = data.items
      .map((row) => row.blockedId)
      .filter((id): id is string => typeof id === 'string');
    if (newIds.length === 0) return;

    const prev = queryClient.getQueryData<Set<string>>(queryKeys.blockedUsers.ids());
    if (prev && newIds.every((id) => prev.has(id))) return;

    queryClient.setQueryData<Set<string>>(queryKeys.blockedUsers.ids(), (existing) => {
      const idSet = new Set(existing ?? []);
      newIds.forEach((id) => idSet.add(id));
      return idSet;
    });
  }, [query.data, queryClient]);

  return query;
}

/**
 * Direct accessor for the blocked-user IDs Set from cache.
 * Non-reactive — use useIsUserBlocked() for reactive per-user checks.
 */
export function getBlockedUserIdsSnapshot(
  qc: ReturnType<typeof useQueryClient>,
): Set<string> {
  return qc.getQueryData<Set<string>>(queryKeys.blockedUsers.ids()) ?? new Set();
}

/**
 * Reactive "have I blocked this user" check for ChatWindow's header
 * action — same shape and reasoning as useIsFollowingStore: fetches the
 * full blocked-users list once (capped at 100, matching the
 * useMyFollowedStores({ limit: 100 }) convention) and checks membership
 * against the shared cache Set, which useToggleUserBlock keeps in sync
 * on every successful toggle.
 */
export function useIsUserBlocked(userId: string): boolean {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient = useQueryClient();
  useMyBlockedUsers({ limit: 100 });

  return useQueryIdSetMembership(
    queryClient,
    queryKeys.blockedUsers.ids(),
    userId,
    isAuthenticated,
  );
}
