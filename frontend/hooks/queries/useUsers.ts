/**
 * TanStack Query hooks for user profiles.
 *
 * NOTE: useUserAds is intentionally NOT exported from here.
 *       It is defined in useAds.ts alongside the other ad query hooks.
 *       Exporting a second copy here caused a duplicate-export conflict
 *       and split the responsibility across two files.
 */
import { useQuery } from '@tanstack/react-query';
import { usersApi }  from '@/api/users.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

/** Public profile for a given user ID. */
export function useUser(id: string) {
  return useQuery({
    queryKey:  queryKeys.users.detail(id),
    // API-INT-01 FIX: was r.data — that returns the ApiResponse envelope.
    // Must be r.data.data to unwrap to the actual PublicUser payload.
    queryFn:   () => usersApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.publicProfile,   // added to CACHE_TTL in constants.ts
    enabled:   Boolean(id),
  });
}
