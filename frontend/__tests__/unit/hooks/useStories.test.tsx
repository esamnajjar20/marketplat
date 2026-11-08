import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUserStories } from '@/hooks/queries/useStories';
import { storiesApi } from '@/api/stories.api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/stories.api', () => ({
  storiesApi: { userStories: vi.fn(), feed: vi.fn(), viewers: vi.fn() },
}));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().logout();
  useAuthStore.getState().setAuth(
    { id: 'u1', name: 'User', email: 'user@example.com', role: 'USER' },
    { accessToken: 'access-token' },
  );
});

describe('useUserStories', () => {
  it('does not request story data until the caller explicitly enables it', async () => {
    renderHook(() => useUserStories('u2', false), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(storiesApi.userStories).not.toHaveBeenCalled();
  });

  it('requests stories when the user asks to view them', async () => {
    (storiesApi.userStories as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'story-1' }] },
    });
    const { result } = renderHook(() => useUserStories('u2', true), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'story-1' }]));
    expect(storiesApi.userStories).toHaveBeenCalledTimes(1);
    expect(storiesApi.userStories).toHaveBeenCalledWith('u2', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
