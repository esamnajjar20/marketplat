import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateServiceListing,
  useUpdateServiceListing,
  useAddServiceListingImages,
  useRemoveServiceListingImage,
  useReorderServiceListingImages,
  useDeleteServiceListing,
  useToggleServiceListingStatus,
} from '@/hooks/mutations/useServiceListingMutations';
import { serviceListingsApi } from '@/api/service-listings.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/api/service-listings.api', () => ({
  serviceListingsApi: {
    create: vi.fn(),
    update: vi.fn(),
    addImages: vi.fn(),
    removeImage: vi.fn(),
    reorderImages: vi.fn(),
    delete: vi.fn(),
  },
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

describe('useCreateServiceListing', () => {
  it('invalidates the listings cache, toasts success, and redirects to my-services', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (serviceListingsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sl1' } } });

    const { result } = renderHook(() => useCreateServiceListing(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ title: 'تصليح مكيفات' } as never);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.all() });
    expect(toast.success).toHaveBeenCalledWith('تم نشر الخدمة بنجاح');
    expect(mockPush).toHaveBeenCalledWith('/my-services');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = newClient();
    (serviceListingsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 400, data: { message: 'بيانات غير صالحة' } },
    });

    const { result } = renderHook(() => useCreateServiceListing(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ title: 'تصليح مكيفات' } as never);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useUpdateServiceListing', () => {
  it('calls update with the bound id, invalidates the whole list, and redirects', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (serviceListingsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sl1' } } });

    const { result } = renderHook(() => useUpdateServiceListing('sl1'), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ title: 'عنوان جديد' } as never);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceListingsApi.update).toHaveBeenCalledWith('sl1', { title: 'عنوان جديد' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.all() });
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التعديلات');
    expect(mockPush).toHaveBeenCalledWith('/my-services');
  });
});

describe('useAddServiceListingImages', () => {
  it('invalidates the list and the detail query for the given id', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (serviceListingsApi.addImages as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sl1' } } });

    const { result } = renderHook(() => useAddServiceListingImages(), { wrapper: createWrapper(queryClient) });
    const files = [new File(['x'], 'photo.jpg')];
    act(() => {
      result.current.mutate({ id: 'sl1', files });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceListingsApi.addImages).toHaveBeenCalledWith('sl1', files, undefined);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.all() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.detail('sl1') });
  });

  it('shows an error toast on failure', async () => {
    const queryClient = newClient();
    (serviceListingsApi.addImages as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 400, data: { message: 'فشل الرفع' } },
    });

    const { result } = renderHook(() => useAddServiceListingImages(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'sl1', files: [] });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useRemoveServiceListingImage', () => {
  it('invalidates the list and the detail query for the given id', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (serviceListingsApi.removeImage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sl1' } } });

    const { result } = renderHook(() => useRemoveServiceListingImage(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'sl1', imageUrl: 'https://example.com/a.jpg' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceListingsApi.removeImage).toHaveBeenCalledWith('sl1', 'https://example.com/a.jpg');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.all() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.detail('sl1') });
  });
});

describe('useReorderServiceListingImages', () => {
  it('invalidates the list and the detail query for the given id', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (serviceListingsApi.reorderImages as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sl1' } } });

    const { result } = renderHook(() => useReorderServiceListingImages(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'sl1', images: ['b.jpg', 'a.jpg'] });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceListingsApi.reorderImages).toHaveBeenCalledWith('sl1', ['b.jpg', 'a.jpg']);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.all() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.detail('sl1') });
  });
});

describe('useDeleteServiceListing', () => {
  it('invalidates the listings cache and shows a success toast', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (serviceListingsApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useDeleteServiceListing(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate('sl1');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.all() });
    expect(toast.success).toHaveBeenCalledWith('تم حذف الخدمة');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = newClient();
    (serviceListingsApi.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 403, data: { message: 'غير مصرح' } },
    });

    const { result } = renderHook(() => useDeleteServiceListing(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate('sl1');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useToggleServiceListingStatus', () => {
  it('optimistically patches matching cached lists before the request resolves', async () => {
    const queryClient = newClient();
    const listKey = queryKeys.serviceListings.list({ page: 1 });
    queryClient.setQueryData(listKey, { items: [{ id: 'sl1', status: 'ACTIVE' }], total: 1 });
    (serviceListingsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sl1' } } });

    const { result } = renderHook(() => useToggleServiceListingStatus(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'sl1', status: 'PAUSED' });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<{ items: Array<{ id: string; status: string }> }>(listKey);
      expect(cached?.items[0].status).toBe('PAUSED');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إيقاف الخدمة مؤقتاً');
  });

  it('shows the resume toast when status is set back to ACTIVE', async () => {
    const queryClient = newClient();
    (serviceListingsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'sl1' } } });

    const { result } = renderHook(() => useToggleServiceListingStatus(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'sl1', status: 'ACTIVE' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toast.success).toHaveBeenCalledWith('تمت إعادة تفعيل الخدمة');
  });

  it('rolls back the cache and shows an error toast on failure', async () => {
    const queryClient = newClient();
    const listKey = queryKeys.serviceListings.list({ page: 1 });
    queryClient.setQueryData(listKey, { items: [{ id: 'sl1', status: 'ACTIVE' }], total: 1 });
    (serviceListingsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 500, data: { message: 'خطأ في الخادم' } },
    });

    const { result } = renderHook(() => useToggleServiceListingStatus(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ id: 'sl1', status: 'PAUSED' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const cached = queryClient.getQueryData<{ items: Array<{ id: string; status: string }> }>(listKey);
    expect(cached?.items[0].status).toBe('ACTIVE');
    expect(toast.error).toHaveBeenCalled();
  });
});
