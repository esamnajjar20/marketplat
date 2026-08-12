/**
 * __tests__/unit/hooks/useBlockedUsers.test.tsx
 *
 * Previously uncovered (0%). Mirrors useFavorites.test.tsx /
 * useStores.test.tsx's approach for the shared-cache-Set side effect.
 *
 *  useMyBlockedUsers:
 *   - auth-gated
 *   - merges each page's blockedId into the shared ids() Set after the
 *     query settles
 *  getBlockedUserIdsSnapshot: reads the cached Set, defaults to empty.
 *  useIsUserBlocked:
 *   - returns false before any data has loaded
 *   - returns true once the shared Set contains the userId
 *   - reacts to the shared cache being updated elsewhere
 *   - returns false for a logged-out user even with a stale Set
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useMyBlockedUsers,
  getBlockedUserIdsSnapshot,
  useIsUserBlocked,
} from '@/hooks/queries/useBlockedUsers';
import { blockedUsersApi } from '@/api/blocked-users.api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/blocked-users.api', () => ({
  blockedUsersApi: { getMine: vi.fn() },
}));

const mockUser = { id: 'user-1', name: 'Ahmed', email: 'ahmed@example.com', role: 'USER' as const };
const mockTokens = { accessToken: 'a' };

function makeSharedClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().logout();
});

describe('useMyBlockedUsers', () => {
  it('does not fetch when not authenticated', () => {
    const queryClient = makeSharedClient();
    renderHook(() => useMyBlockedUsers(), { wrapper: wrapperFor(queryClient) });
    expect(blockedUsersApi.getMine).not.toHaveBeenCalled();
  });

  it('merges blockedIds from the fetched page into the shared ids() Set', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (blockedUsersApi.getMine as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ blockedId: 'user-2' }, { blockedId: 'user-3' }], meta: {} } },
    });
    const queryClient = makeSharedClient();

    renderHook(() => useMyBlockedUsers(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => {
      const ids = queryClient.getQueryData(queryKeys.blockedUsers.ids());
      expect(ids).toBeInstanceOf(Set);
    });

    const ids = queryClient.getQueryData<Set<string>>(queryKeys.blockedUsers.ids());
    expect(ids!.has('user-2')).toBe(true);
    expect(ids!.has('user-3')).toBe(true);
  });
});

describe('getBlockedUserIdsSnapshot', () => {
  it('returns an empty Set when nothing has been cached yet', () => {
    const queryClient = makeSharedClient();
    expect(getBlockedUserIdsSnapshot(queryClient)).toEqual(new Set());
  });

  it('returns the cached Set when one exists', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.blockedUsers.ids(), new Set(['user-9']));
    expect(getBlockedUserIdsSnapshot(queryClient)).toEqual(new Set(['user-9']));
  });
});

describe('useIsUserBlocked', () => {
  beforeEach(() => {
    // useIsUserBlocked internally calls useMyBlockedUsers({ limit: 100 }),
    // so a default resolved mock avoids unhandled promise noise in tests
    // that don't care about that fetch.
    (blockedUsersApi.getMine as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [], meta: {} } },
    });
  });

  it('returns false before any data has loaded', () => {
    const queryClient = makeSharedClient();
    const { result } = renderHook(() => useIsUserBlocked('user-1'), {
      wrapper: wrapperFor(queryClient),
    });
    expect(result.current).toBe(false);
  });

  it('returns true once the shared Set contains the userId', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.blockedUsers.ids(), new Set(['user-1']));
    useAuthStore.getState().setAuth(mockUser, mockTokens);

    const { result } = renderHook(() => useIsUserBlocked('user-1'), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current).toBe(true);
  });

  it('reacts when the shared cache is updated elsewhere', async () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.blockedUsers.ids(), new Set<string>());
    useAuthStore.getState().setAuth(mockUser, mockTokens);

    const { result } = renderHook(() => useIsUserBlocked('user-5'), {
      wrapper: wrapperFor(queryClient),
    });
    expect(result.current).toBe(false);

    act(() => {
      queryClient.setQueryData<Set<string>>(queryKeys.blockedUsers.ids(), (old) =>
        new Set([...(old ?? []), 'user-5']),
      );
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false for a logged-out user even if a populated Set exists', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.blockedUsers.ids(), new Set(['user-1']));

    const { result } = renderHook(() => useIsUserBlocked('user-1'), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current).toBe(false);
  });
});
