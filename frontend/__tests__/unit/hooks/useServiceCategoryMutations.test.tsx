import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateServiceCategory,
  useUpdateServiceCategory,
  useDeleteServiceCategory,
  useToggleServiceCategoryActive,
} from '@/hooks/mutations/useServiceCategoryMutations';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

vi.mock('@/api/service-categories.api', () => ({
  serviceCategoriesApi: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
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

describe('useCreateServiceCategory', () => {
  it('invalidates both the admin tree and the public tree, and shows a success toast', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (serviceCategoriesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sc1' } } });

    const { result } = renderHook(() => useCreateServiceCategory(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ name: 'Plumbing', nameAr: 'سباكة', slug: 'plumbing' } as never);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceCategories.adminAll() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceCategories.all() });
    expect(toast.success).toHaveBeenCalledWith('تم إنشاء فئة الخدمة');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = newClient();
    (serviceCategoriesApi.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 400, data: { message: 'الاسم مستخدم بالفعل' } },
    });

    const { result } = renderHook(() => useCreateServiceCategory(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ name: 'Plumbing', nameAr: 'سباكة', slug: 'plumbing' } as never);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useUpdateServiceCategory', () => {
  it('calls serviceCategoriesApi.update with the bound id and the payload', async () => {
    const queryClient = newClient();
    (serviceCategoriesApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sc1' } } });

    const { result } = renderHook(() => useUpdateServiceCategory('sc1'), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ name: 'New Name' } as never);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceCategoriesApi.update).toHaveBeenCalledWith('sc1', { name: 'New Name' });
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التعديلات');
  });
});

describe('useDeleteServiceCategory', () => {
  it('invalidates both trees and shows a success toast', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (serviceCategoriesApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useDeleteServiceCategory(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate('sc1');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceCategories.adminAll() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceCategories.all() });
    expect(toast.success).toHaveBeenCalledWith('تم حذف الفئة');
  });

  it('shows an error toast when deletion fails (e.g. category still has listings)', async () => {
    const queryClient = newClient();
    (serviceCategoriesApi.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 409, data: { message: 'لا يمكن حذف فئة تحتوي على خدمات' } },
    });

    const { result } = renderHook(() => useDeleteServiceCategory(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate('sc1');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useToggleServiceCategoryActive', () => {
  it('optimistically patches the admin tree cache before the request resolves', async () => {
    const queryClient = newClient();
    const key = queryKeys.serviceCategories.adminAll();
    queryClient.setQueryData(key, [{ id: 'sc1', isActive: true, children: [] }]);
    (serviceCategoriesApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sc1' } } });

    const { result } = renderHook(() => useToggleServiceCategoryActive(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'sc1', isActive: false });
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
    const key = queryKeys.serviceCategories.adminAll();
    queryClient.setQueryData(key, [{ id: 'sc1', isActive: true, children: [] }]);
    (serviceCategoriesApi.update as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 500, data: { message: 'خطأ في الخادم' } },
    });

    const { result } = renderHook(() => useToggleServiceCategoryActive(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'sc1', isActive: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const cached = queryClient.getQueryData<Array<{ id: string; isActive: boolean }>>(key);
    expect(cached?.[0].isActive).toBe(true);
    expect(toast.error).toHaveBeenCalled();
  });
});
