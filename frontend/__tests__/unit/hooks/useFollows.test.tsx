import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useFollowStatus } from '@/hooks/queries/useFollows';
import { followsApi } from '@/api/follows.api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/follows.api', () => ({
  followsApi: {
    status: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().logout();
});

function login() {
  useAuthStore.getState().setAuth(
    { id: 'u1', name: 'User', email: 'user@example.com', role: 'USER' },
    { accessToken: 'access-token' },
  );
}

describe('useFollowStatus', () => {
  it('automatically skips a self-follow status lookup', async () => {
    login();
    renderHook(() => useFollowStatus('USER', 'u1'), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(followsApi.status).not.toHaveBeenCalled();
  });

  it('does not request follow status when the caller already knows it is the current user', async () => {
    login();
    renderHook(() => useFollowStatus('USER', 'u1', { enabled: false }), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(followsApi.status).not.toHaveBeenCalled();
  });

  it('requests one target status when enabled', async () => {
    login();
    (followsApi.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { following: true } },
    });
    const { result } = renderHook(() => useFollowStatus('USER', 'u2'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBe(true));
    expect(followsApi.status).toHaveBeenCalledTimes(1);
    expect(followsApi.status).toHaveBeenCalledWith('USER', 'u2', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
