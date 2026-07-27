/**
 * Auth query hooks — read-only queries for session data.
 *
 * These complement the auth mutations in useAuthMutations.ts.
 * The user's profile data is fetched here and merged into the Zustand store.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { authApi }  from '@/api/auth.api';
import { usersApi } from '@/api/users.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

/** GET /users/me — authenticated user's full profile */
export function useMe() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey:  queryKeys.auth.me(),
    queryFn:   () => usersApi.getMe().then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    enabled:   isAuthenticated,
  });
}

/** GET /auth/sessions — all active sessions for the current user */
export function useSessions() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey:  queryKeys.auth.sessions(),
    queryFn:   () => authApi.getSessions().then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.sessions,
    enabled:   isAuthenticated,
  });
}

/**
 * Alias: useAuthSessions — same as useSessions(), preferred name in session UI components.
 */
export const useAuthSessions = useSessions;
