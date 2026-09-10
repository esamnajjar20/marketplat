/**
 * __tests__/unit/hooks/useFavoriteListMutations.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useCreateFavoriteList,
  useRenameFavoriteList,
  useDeleteFavoriteList,
  useMoveFavoriteToList,
} from '@/hooks/mutations/useFavoriteListMutations';
import { favoriteListsApi } from '@/api/favorite-lists.api';
import { toast } from 'sonner';

vi.mock('@/api/favorite-lists.api', () => ({
  favoriteListsApi: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    moveFavorite: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/errorParser', () => ({
  parseApiError: (err: unknown) => ({
    message: err instanceof Error ? err.message : 'خطأ',
  }),
}));

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function W({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useFavoriteListMutations', () => {
  beforeEach(() => {
    vi.mocked(favoriteListsApi.create).mockReset();
    vi.mocked(favoriteListsApi.rename).mockReset();
    vi.mocked(favoriteListsApi.remove).mockReset();
    vi.mocked(favoriteListsApi.moveFavorite).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('create shows success toast', async () => {
    vi.mocked(favoriteListsApi.create).mockResolvedValue({
      id: 'l1',
      name: 'سيارات',
      sortOrder: 0,
      itemsCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useCreateFavoriteList(), { wrapper: wrapper() });

    await act(async () => {
      result.current.mutate('سيارات');
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('تم إنشاء القائمة'));
    expect(favoriteListsApi.create).toHaveBeenCalledWith({ name: 'سيارات' });
  });

  it('create shows error toast on failure', async () => {
    vi.mocked(favoriteListsApi.create).mockRejectedValue(new Error('فشل'));

    const { result } = renderHook(() => useCreateFavoriteList(), { wrapper: wrapper() });

    await act(async () => {
      result.current.mutate('سيارات');
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('فشل'));
  });

  it('rename calls API with listId and name', async () => {
    vi.mocked(favoriteListsApi.rename).mockResolvedValue({
      id: 'l1',
      name: 'جديد',
      sortOrder: 0,
      itemsCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useRenameFavoriteList(), { wrapper: wrapper() });

    await act(async () => {
      result.current.mutate({ listId: 'l1', name: 'جديد' });
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(favoriteListsApi.rename).toHaveBeenCalledWith('l1', { name: 'جديد' });
  });

  it('delete calls remove', async () => {
    vi.mocked(favoriteListsApi.remove).mockResolvedValue({ data: { data: null } } as never);

    const { result } = renderHook(() => useDeleteFavoriteList(), { wrapper: wrapper() });

    await act(async () => {
      result.current.mutate('l1');
    });

    await waitFor(() => expect(favoriteListsApi.remove).toHaveBeenCalledWith('l1'));
  });

  it('moveFavorite calls API and toasts success', async () => {
    vi.mocked(favoriteListsApi.moveFavorite).mockResolvedValue({});

    const { result } = renderHook(() => useMoveFavoriteToList(), { wrapper: wrapper() });

    await act(async () => {
      result.current.mutate({ favoriteId: 'fav-1', listId: 'l2' });
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('تم نقل العنصر'));
    expect(favoriteListsApi.moveFavorite).toHaveBeenCalledWith('fav-1', { listId: 'l2' });
  });
});
