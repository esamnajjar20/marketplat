/**
 * Auth query hooks — read-only queries for session data.
 *
 * These complement the auth mutations in useAuthMutations.ts.
 * The user's profile data is fetched here and merged into the Zustand store.
 */
'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/api/auth.api';
import { usersApi } from '@/api/users.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { getOfflineJson, saveOfflineJson, OFFLINE_JSON_KEYS } from '@/lib/offlineJsonCache';
import type { User } from '@/types/user.types';

/**
 * GET /users/me — authenticated user's full profile.
 *
 * FIX OFFLINE-PROFILE-UNUSED-01: OFFLINE_JSON_KEYS.userProfileSelf existed
 * since the offline work landed but nothing ever wrote or read it — a
 * declared-but-dead cache slot (found during audit). Wired the same way
 * useMyNotifications wires notificationsCache: seed from the last saved
 * copy as initialData (so a header/profile page relying on useMe() has
 * something to show immediately offline instead of a blank/loading
 * state), and persist every successful fetch.
 */
export function useMe() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const cached = getOfflineJson<User>(OFFLINE_JSON_KEYS.userProfileSelf);

  const query = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => usersApi.getMe().then((r) => r.data.data),
    staleTime: CACHE_TTL.userProfile,
    // FIX AUTH-401-STORM-01: لا تطلب API بلا access token حقيقي.
    enabled: isAuthenticated && hasToken,
    ...(cached ? { initialData: cached.data, initialDataUpdatedAt: new Date(cached.savedAt).getTime() } : {}),
  });

  useEffect(() => {
    if (query.data) saveOfflineJson(OFFLINE_JSON_KEYS.userProfileSelf, query.data);
  }, [query.data]);

  return query;
}

/** GET /auth/sessions — all active sessions for the current user */
export function useSessions() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);

  return useQuery({
    queryKey: queryKeys.auth.sessions(),
    queryFn: () => authApi.getSessions().then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.sessions,
    enabled: isAuthenticated && hasToken,
  });
}

/**
 * Alias: useAuthSessions — same as useSessions(), preferred name in session UI components.
 */
export const useAuthSessions = useSessions;
