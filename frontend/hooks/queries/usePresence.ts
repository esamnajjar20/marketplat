'use client';

import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/api/users.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
// import { pollingInterval } from '@/lib/polling'; // FIX: unused after disabling polling
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * GET /users/presence?ids=... — one bulk lookup for the visible user IDs.
 * No polling: the cached result is reused until stale or explicitly refreshed.
 *
 * userIds should be a stable array (memoized by the caller) — it feeds
 * queryKeys.presence.bulk, which sorts+joins it into the cache key, so
 * a fresh array literal every render still hits the same cache entry,
 * but passing a genuinely different set of ids on every render would
 * still cause unnecessary refetches.
 */
export function usePresence(userIds: string[], enabled = true) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.presence.bulk(userIds),
    queryFn: ({ signal }) => usersApi.getPresence(userIds, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.presence,
    // refetchInterval: () => pollingInterval(CACHE_TTL.presence, 3), // FIX: Disabled polling to save server resources
    // Avoid an extra immediate fetch merely because a long-lived protected
    // page regained focus; reconnect/online changes still refresh normally.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    enabled: enabled && isAuthenticated && userIds.length > 0 && (hasToken || !isOnline),
  });
}

/**
 * Single-user convenience wrapper — ChatWindow only ever needs one dot
 * (the other party in the thread), so this avoids every call site
 * having to wrap a single id in an array and unwrap the result map.
 */
export function useIsUserOnline(userId: string | undefined, enabled = true): boolean {
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { data } = usePresence(userId ? [userId] : [], enabled && userId !== currentUserId);
  return userId ? Boolean(data?.[userId]?.online) : false;
}

export function useUserPresence(userId: string | undefined) {
  const { data } = usePresence(userId ? [userId] : []);
  return userId ? data?.[userId] ?? { online: false, lastSeenAt: null } : { online: false, lastSeenAt: null };
}
