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
import { saveAdDraft } from '@/lib/offlineAdDrafts';
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

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: { id: string } | null }) => s.user,
}));

vi.mock('@/lib/offlineAdDrafts', () => ({
  saveAdDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/imageOffline', () => ({
  compressImageForOffline: vi.fn(),
}));

import { useAuthStore } from '@/store/auth.store';
import { compressImageForOffline } from '@/lib/imageOffline';

function mockCurrentUser(id: string | null) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { user: { id: string } | null }) => unknown) =>
      selector({ user: id ? { id } : null }),
  );
}

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
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
  mockCurrentUser('user-1');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
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

  it('saves an offline draft with kind:service and the same operationId sent to the API', async () => {
    const queryClient = newClient();
    (serviceListingsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const payload = {
      categoryId: 'c1',
      title: 'تصليح مكيفات',
      description: 'وصف',
      pricingType: 'FIXED',
      price: 50,
      serviceLocation: 'AT_PROVIDER',
      images: [],
    } as never;

    const { result } = renderHook(() => useCreateServiceListing(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(saveAdDraft).toHaveBeenCalled());
    const sentOperationId = (serviceListingsApi.create as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(typeof sentOperationId).toBe('string');
    expect(saveAdDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'create',
        kind: 'service',
        status: 'pending_sync',
        operationId: sentOperationId,
        userId: 'user-1',
        payload: expect.objectContaining({
          title: 'تصليح مكيفات',
          description: 'وصف',
        }),
      }),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.message).toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('stores imageLabels and compressed previews on offline create', async () => {
    const queryClient = newClient();
    (serviceListingsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const fakeBlob = new Blob(['x'], { type: 'image/jpeg' });
    vi.mocked(compressImageForOffline).mockResolvedValue(fakeBlob);
    const file = new File(['x'], 'svc.png', { type: 'image/png' });

    const { result } = renderHook(() => useCreateServiceListing(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({
        categoryId: 'c1',
        title: 'خدمة',
        description: 'وصف',
        pricingType: 'FIXED',
        serviceLocation: 'AT_PROVIDER',
        images: [file],
      } as never);
    });

    await waitFor(() => expect(saveAdDraft).toHaveBeenCalled());
    const saved = (saveAdDraft as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.payload.imageLabels).toEqual(['svc.png']);
    expect(saved.payload).not.toHaveProperty('images');
    expect(saved.images).toEqual([{ name: 'svc.png', blob: fakeBlob }]);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
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

    expect(serviceListingsApi.update).toHaveBeenCalledWith(
      'sl1',
      { title: 'عنوان جديد' },
      expect.any(String),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.serviceListings.all() });
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التعديلات');
    expect(mockPush).toHaveBeenCalledWith('/my-services');
  });

  it('saves an offline draft with kind:service, remoteAdId, and matching operationId', async () => {
    const queryClient = newClient();
    (serviceListingsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const { result } = renderHook(() => useUpdateServiceListing('sl1'), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ title: 'تعديل أوفلاين' } as never); });

    await waitFor(() => expect(saveAdDraft).toHaveBeenCalled());
    const sentOperationId = (serviceListingsApi.update as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(saveAdDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'edit',
        kind: 'service',
        remoteAdId: 'sl1',
        status: 'pending_sync',
        operationId: sentOperationId,
        userId: 'user-1',
      }),
    );
    expect(toast.error).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});

describe('useAddServiceListingImages', () => {
  it('invalidates the listing prefix (which includes the detail cache)', async () => {
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
  it('invalidates the listing prefix (which includes the detail cache)', async () => {
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
  });
});

describe('useReorderServiceListingImages', () => {
  it('invalidates the listing prefix (which includes the detail cache)', async () => {
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
