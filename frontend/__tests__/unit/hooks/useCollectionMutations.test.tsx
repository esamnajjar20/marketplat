/**
 * useCollectionMutations — previously uncovered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
  useReorderCollections,
  useAddProductToCollection,
  useRemoveProductFromCollection,
} from '@/hooks/mutations/useCollectionMutations';
import { collectionsApi } from '@/api/collections.api';
import { toast } from 'sonner';

vi.mock('@/api/collections.api', () => ({
  collectionsApi: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    addProduct: vi.fn(),
    removeProduct: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/errorParser', () => ({
  parseApiError: () => ({ message: 'فشل العملية' }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidateSpy };
}

beforeEach(() => vi.clearAllMocks());

describe('useCreateCollection', () => {
  it('calls API, invalidates mine, and toasts success', async () => {
    (collectionsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'c1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useCreateCollection(), { wrapper });

    act(() => {
      result.current.mutate({ name: 'مجموعة' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(collectionsApi.create).toHaveBeenCalledWith({ name: 'مجموعة' });
    expect(invalidateSpy).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('toasts error on failure', async () => {
    (collectionsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('x'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateCollection(), { wrapper });

    act(() => {
      result.current.mutate({ name: 'مجموعة' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith('فشل العملية');
  });
});

describe('useUpdateCollection', () => {
  it('updates and invalidates detail + mine', async () => {
    (collectionsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'c1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useUpdateCollection('c1'), { wrapper });

    act(() => {
      result.current.mutate({ name: 'جديد' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(collectionsApi.update).toHaveBeenCalledWith('c1', { name: 'جديد' });
    expect(invalidateSpy).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });
});

describe('useDeleteCollection', () => {
  it('deletes and toasts', async () => {
    (collectionsApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteCollection(), { wrapper });

    act(() => {
      result.current.mutate('c1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(collectionsApi.delete).toHaveBeenCalledWith('c1');
    expect(toast.success).toHaveBeenCalled();
  });
});

describe('useReorderCollections', () => {
  it('reorders without success toast', async () => {
    (collectionsApi.reorder as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReorderCollections(), { wrapper });

    act(() => {
      result.current.mutate({ orderedIds: ['a', 'b'] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(collectionsApi.reorder).toHaveBeenCalledWith({ orderedIds: ['a', 'b'] });
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('useAddProductToCollection / useRemoveProductFromCollection', () => {
  it('adds a product and toasts', async () => {
    (collectionsApi.addProduct as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAddProductToCollection('c1'), { wrapper });

    act(() => {
      result.current.mutate('p1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(collectionsApi.addProduct).toHaveBeenCalledWith('c1', 'p1');
    expect(toast.success).toHaveBeenCalled();
  });

  it('removes a product and toasts', async () => {
    (collectionsApi.removeProduct as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRemoveProductFromCollection('c1'), { wrapper });

    act(() => {
      result.current.mutate('p1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(collectionsApi.removeProduct).toHaveBeenCalledWith('c1', 'p1');
    expect(toast.success).toHaveBeenCalled();
  });
});
