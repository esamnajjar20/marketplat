/**
 * __tests__/unit/hooks/useFavoriteLists.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useFavoriteLists, favoriteListsQueryKey } from '@/hooks/queries/useFavoriteLists';
import { favoriteListsApi } from '@/api/favorite-lists.api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/favorite-lists.api', () => ({
  favoriteListsApi: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    moveFavorite: vi.fn(),
  },
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function W({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useFavoriteLists', () => {
  beforeEach(() => {
    vi.mocked(favoriteListsApi.list).mockReset();
  });

  it('exports a stable query key', () => {
    expect(favoriteListsQueryKey).toEqual(['favorites', 'lists']);
  });

  it('does not fetch when unauthenticated', async () => {
    vi.mocked(useAuthStore).mockImplementation((selector: unknown) =>
      (selector as (s: { isAuthenticated: boolean }) => unknown)({ isAuthenticated: false }),
    );

    const { result } = renderHook(() => useFavoriteLists(), { wrapper: wrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(favoriteListsApi.list).not.toHaveBeenCalled();
  });

  it('fetches lists when authenticated', async () => {
    vi.mocked(useAuthStore).mockImplementation((selector: unknown) =>
      (selector as (s: { isAuthenticated: boolean }) => unknown)({ isAuthenticated: true }),
    );
    vi.mocked(favoriteListsApi.list).mockResolvedValue([
      {
        id: 'l1',
        name: 'سيارات',
        sortOrder: 0,
        itemsCount: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const { result } = renderHook(() => useFavoriteLists(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.name).toBe('سيارات');
    expect(favoriteListsApi.list).toHaveBeenCalledTimes(1);
  });
});
