import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/mutations/useCategoryMutations';
import { categoriesApi } from '@/api/categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

vi.mock('@/api/categories.api', () => ({
  categoriesApi: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCreateCategory', () => {
  it('invalidates the categories cache and shows a success toast', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (categoriesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'c1' } } });

    const { result } = renderHook(() => useCreateCategory(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.categories.all() });
    expect(toast.success).toHaveBeenCalledWith('تم إنشاء الفئة');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    (categoriesApi.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 400, data: { message: 'الاسم مستخدم بالفعل' } },
    });

    const { result } = renderHook(() => useCreateCategory(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useUpdateCategory', () => {
  it('calls categoriesApi.update with the bound id and the payload', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    (categoriesApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'c1' } } });

    const { result } = renderHook(() => useUpdateCategory('c1'), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ name: 'New Name' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(categoriesApi.update).toHaveBeenCalledWith('c1', { name: 'New Name' });
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التعديلات');
  });
});

describe('useDeleteCategory', () => {
  it('invalidates the categories cache and shows a success toast', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (categoriesApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useDeleteCategory(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate('c1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.categories.all() });
    expect(toast.success).toHaveBeenCalledWith('تم حذف الفئة');
  });

  it('shows an error toast when deletion fails (e.g. category still has ads)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    (categoriesApi.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 409, data: { message: 'لا يمكن حذف فئة تحتوي على إعلانات' } },
    });

    const { result } = renderHook(() => useDeleteCategory(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate('c1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});
