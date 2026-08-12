import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateProductCategory,
  useUpdateProductCategory,
  useDeleteProductCategory,
  useToggleProductCategoryActive,
} from '@/hooks/mutations/useProductCategoryMutations';
import { productCategoriesApi } from '@/api/product-categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

vi.mock('@/api/product-categories.api', () => ({
  productCategoriesApi: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCreateProductCategory', () => {
  it('invalidates both the admin tree and the public tree, and shows a success toast', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (productCategoriesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'pc1' } } });

    const { result } = renderHook(() => useCreateProductCategory(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ name: 'Phones', nameAr: 'هواتف', slug: 'phones' } as never);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.productCategories.adminAll() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.productCategories.all() });
    expect(toast.success).toHaveBeenCalledWith('تم إنشاء فئة المنتج');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = newClient();
    (productCategoriesApi.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 400, data: { message: 'الاسم مستخدم بالفعل' } },
    });

    const { result } = renderHook(() => useCreateProductCategory(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ name: 'Phones', nameAr: 'هواتف', slug: 'phones' } as never);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useUpdateProductCategory', () => {
  it('calls productCategoriesApi.update with the bound id and the payload', async () => {
    const queryClient = newClient();
    (productCategoriesApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'pc1' } } });

    const { result } = renderHook(() => useUpdateProductCategory('pc1'), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ name: 'New Name' } as never);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(productCategoriesApi.update).toHaveBeenCalledWith('pc1', { name: 'New Name' });
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التعديلات');
  });
});

describe('useDeleteProductCategory', () => {
  it('invalidates both trees and shows a success toast', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (productCategoriesApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useDeleteProductCategory(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate('pc1');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.productCategories.adminAll() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.productCategories.all() });
    expect(toast.success).toHaveBeenCalledWith('تم حذف الفئة');
  });

  it('shows an error toast when deletion fails (e.g. category still has products)', async () => {
    const queryClient = newClient();
    (productCategoriesApi.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 409, data: { message: 'لا يمكن حذف فئة تحتوي على منتجات' } },
    });

    const { result } = renderHook(() => useDeleteProductCategory(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate('pc1');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useToggleProductCategoryActive', () => {
  it('optimistically patches the admin tree cache before the request resolves', async () => {
    const queryClient = newClient();
    const key = queryKeys.productCategories.adminAll();
    queryClient.setQueryData(key, [{ id: 'pc1', isActive: true, children: [] }]);
    (productCategoriesApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'pc1' } } });

    const { result } = renderHook(() => useToggleProductCategoryActive(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'pc1', isActive: false });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Array<{ id: string; isActive: boolean }>>(key);
      expect(cached?.[0].isActive).toBe(false);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إخفاء الفئة');
  });

  it('rolls back the cache and shows an error toast on failure', async () => {
    const queryClient = newClient();
    const key = queryKeys.productCategories.adminAll();
    queryClient.setQueryData(key, [{ id: 'pc1', isActive: true, children: [] }]);
    (productCategoriesApi.update as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 500, data: { message: 'خطأ في الخادم' } },
    });

    const { result } = renderHook(() => useToggleProductCategoryActive(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'pc1', isActive: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const cached = queryClient.getQueryData<Array<{ id: string; isActive: boolean }>>(key);
    expect(cached?.[0].isActive).toBe(true);
    expect(toast.error).toHaveBeenCalled();
  });
});
