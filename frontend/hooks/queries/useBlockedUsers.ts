'use client';

import { useEffect, useMemo } from 'react';
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

/**
 * GET /blocked-users — the complete, paginated list is used only by the
 * blocked-users management view. Per-user UI must use getStatus() or the
 * status embedded in a conversation response instead of fetching this list.
 */
export function useMyBlockedUsers(params?: BlockedUsersQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.blockedUsers.all(params),
    queryFn: ({ signal }) => blockedUsersApi.getMine(params, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated && (hasToken || !isOnline),
  });
}

export interface IsUserBlockedOptions {
  /** Status already returned by the conversation/list response. */
  initialStatus?: boolean;
  /** Timestamp of the response that supplied initialStatus. */
  initialStatusUpdatedAt?: number;
  /** Set false when the caller already has an authoritative status. */
  enabled?: boolean;
}

/**
 * Reactive directional status for one target user.
 *
 * Chat uses isBlockedByMe embedded in its existing conversation payload,
 * so opening a chat does not trigger a second HTTP request. A profile page
 * has no conversation payload, therefore it requests only this user's
 * status rather than downloading up to 100 unrelated blocked users.
 */
export function useIsUserBlocked(
  userId: string,
  options: IsUserBlockedOptions = {},
): boolean {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => queryKeys.blockedUsers.status(userId), [userId]);

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      blockedUsersApi.getStatus(userId, { signal }).then((result) => result?.isBlockedByMe ?? false),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated && Boolean(userId) && currentUserId !== userId &&
      (hasToken || !isOnline) && (options.enabled ?? true),
    initialData: options.initialStatus,
    initialDataUpdatedAt: options.initialStatusUpdatedAt,
  });

  // An existing conversation response is the authoritative source for the
  // status. Refresh an older per-profile cache entry from it without a
  // network request; this also covers a profile screen opened shortly after
  // a block/unblock action.
  useEffect(() => {
    if (!userId || typeof options.initialStatus !== 'boolean') return;
    const cached = queryClient.getQueryData<boolean>(queryKey);
    if (cached === options.initialStatus) return;
    const suppliedAt = options.initialStatusUpdatedAt ?? Date.now();
    const cachedAt = queryClient.getQueryState<boolean>(queryKey)?.dataUpdatedAt ?? 0;
    // A newer explicit status read or a block/unblock mutation wins over
    // an older conversation object that happened to be in the query cache.
    if (cachedAt >= suppliedAt) return;
    queryClient.setQueryData<boolean>(queryKey, options.initialStatus, {
      updatedAt: suppliedAt,
    });
  }, [options.initialStatus, options.initialStatusUpdatedAt, queryClient, queryKey, userId]);

  return isAuthenticated && query.data === true;
}
