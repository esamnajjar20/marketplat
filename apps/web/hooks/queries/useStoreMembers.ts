'use client';

import { useQuery } from '@tanstack/react-query';
import { storeMembersApi } from '@/api/store-members.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { ListStoreMembersQuery } from '@/types/store-member.types';

export function useStoreMembers(storeId: string | undefined, params?: ListStoreMembersQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.stores.members(storeId ?? '', params),
    // unwrapPaginated → { items, meta } under r.data.data
    queryFn: () => storeMembersApi.list(storeId!, params).then((r) => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated && Boolean(storeId) && (hasToken || !isOnline),
  });
}

/** GET /stores/me/member-invites */
export function useMyMemberInvites() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.stores.memberInvites(),
    queryFn: () =>
      storeMembersApi.listMyPendingInvites().then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated && (hasToken || !isOnline),
  });
}
