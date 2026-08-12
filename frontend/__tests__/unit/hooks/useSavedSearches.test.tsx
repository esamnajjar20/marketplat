import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSavedSearches } from '@/hooks/queries/useSavedSearches';
import { savedSearchesApi } from '@/api/savedSearches.api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/savedSearches.api', () => ({
  savedSearchesApi: { getAll: vi.fn() },
}));

const mockUser = { id: 'user-1', name: 'Ahmed', email: 'ahmed@example.com', role: 'USER' as const };
const mockTokens = { accessToken: 'a' };

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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

describe('useSavedSearches', () => {
  it('does not fetch when the user is not authenticated', () => {
    const queryClient = newClient();
    renderHook(() => useSavedSearches(), { wrapper: wrapperFor(queryClient) });
    expect(savedSearchesApi.getAll).not.toHaveBeenCalled();
  });

  it('fetches the saved searches list once authenticated', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (savedSearchesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'ss1', name: 'شقق في غزة' }] },
    });
    const queryClient = newClient();

    const { result } = renderHook(() => useSavedSearches(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(savedSearchesApi.getAll).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ data: { data: [{ id: 'ss1', name: 'شقق في غزة' }] } });
  });

  it('caches under the savedSearches.all() query key', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (savedSearchesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: [] } });
    const queryClient = newClient();

    renderHook(() => useSavedSearches(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => {
      expect(queryClient.getQueryState(queryKeys.savedSearches.all())?.status).toBe('success');
    });
  });

  it('surfaces a fetch failure via isError', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (savedSearchesApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 500, data: { message: 'خطأ في الخادم' } },
    });
    const queryClient = newClient();

    const { result } = renderHook(() => useSavedSearches(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
