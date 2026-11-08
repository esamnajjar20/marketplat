/**
 * Blocked-user reads are split by intent:
 * - the settings screen fetches the paginated list;
 * - profile actions fetch one user's status;
 * - chat uses the status embedded in the conversation payload and performs
 *   no separate block-status request.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMyBlockedUsers, useIsUserBlocked } from '@/hooks/queries/useBlockedUsers';
import { blockedUsersApi } from '@/api/blocked-users.api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/blocked-users.api', () => ({
  blockedUsersApi: { getMine: vi.fn(), getStatus: vi.fn() },
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
  it('does not fetch the management list when not authenticated', () => {
    const queryClient = makeSharedClient();
    renderHook(() => useMyBlockedUsers(), { wrapper: wrapperFor(queryClient) });
    expect(blockedUsersApi.getMine).not.toHaveBeenCalled();
  });

  it('fetches the paginated list when the management view requests it', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (blockedUsersApi.getMine as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ blockedId: 'user-2' }], meta: {} } },
    });
    const queryClient = makeSharedClient();

    const { result } = renderHook(() => useMyBlockedUsers(), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
    expect(blockedUsersApi.getMine).toHaveBeenCalledTimes(1);
  });
});

describe('useIsUserBlocked', () => {
  it('does not make a request for a logged-out user', () => {
    const queryClient = makeSharedClient();
    const { result } = renderHook(() => useIsUserBlocked('user-2'), {
      wrapper: wrapperFor(queryClient),
    });
    expect(result.current).toBe(false);
    expect(blockedUsersApi.getStatus).not.toHaveBeenCalled();
    expect(blockedUsersApi.getMine).not.toHaveBeenCalled();
  });

  it('supports suppressing the status lookup when the target is the current user', () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    const queryClient = makeSharedClient();

    renderHook(() => useIsUserBlocked('user-1', { enabled: false }), {
      wrapper: wrapperFor(queryClient),
    });

    expect(blockedUsersApi.getStatus).not.toHaveBeenCalled();
    expect(blockedUsersApi.getMine).not.toHaveBeenCalled();
  });

  it('automatically skips the status lookup for the current user', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    const queryClient = makeSharedClient();
    renderHook(() => useIsUserBlocked('user-1'), { wrapper: wrapperFor(queryClient) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(blockedUsersApi.getStatus).not.toHaveBeenCalled();
  });

  it('fetches only the target user status for a profile action', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (blockedUsersApi.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      isBlockedByMe: true,
    });
    const queryClient = makeSharedClient();

    const { result } = renderHook(() => useIsUserBlocked('user-2'), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current).toBe(true));
    expect(blockedUsersApi.getStatus).toHaveBeenCalledTimes(1);
    expect(blockedUsersApi.getStatus).toHaveBeenCalledWith('user-2', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(blockedUsersApi.getMine).not.toHaveBeenCalled();
  });

  it('uses the status embedded in an existing conversation without another request', () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    const queryClient = makeSharedClient();

    const { result } = renderHook(
      () => useIsUserBlocked('user-2', { initialStatus: true, initialStatusUpdatedAt: Date.now(), enabled: false }),
      { wrapper: wrapperFor(queryClient) },
    );

    expect(result.current).toBe(true);
    expect(blockedUsersApi.getStatus).not.toHaveBeenCalled();
    expect(blockedUsersApi.getMine).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.blockedUsers.status('user-2'))).toBe(true);
  });

  it('returns false when the queried status is false', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (blockedUsersApi.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      isBlockedByMe: false,
    });
    const queryClient = makeSharedClient();

    const { result } = renderHook(() => useIsUserBlocked('user-3'), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(queryClient.getQueryState(queryKeys.blockedUsers.status('user-3'))?.status).toBe('success'));
    expect(result.current).toBe(false);
  });
});
