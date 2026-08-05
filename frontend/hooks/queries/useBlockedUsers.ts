'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { blockedUsersApi } from '@/api/blocked-users.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import type { BlockedUsersQuery } from '@/types/blocked-user.types';

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
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.blockedUsers.all(params),
    queryFn: () => blockedUsersApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;

    queryClient.setQueryData<Set<string>>(queryKeys.blockedUsers.ids(), (prev) => {
      const idSet = new Set(prev ?? []);
      data.items.forEach((row) => idSet.add(row.blockedId));
      return idSet;
    });
  }, [query.data]);

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

  const [isBlocked, setIsBlocked] = useState<boolean>(() =>
    getBlockedUserIdsSnapshot(queryClient).has(userId),
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setIsBlocked(false);
      return;
    }

    setIsBlocked(getBlockedUserIdsSnapshot(queryClient).has(userId));

    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      const key = event.query.queryKey;
      const idsKey = queryKeys.blockedUsers.ids();
      if (key.length !== idsKey.length || key.some((k: unknown, i: number) => k !== idsKey[i])) return;

      setIsBlocked(getBlockedUserIdsSnapshot(queryClient).has(userId));
    });

    return unsubscribe;
  }, [userId, isAuthenticated, queryClient]);

  return isBlocked;
}
