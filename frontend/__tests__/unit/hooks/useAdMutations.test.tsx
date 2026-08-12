/**
 * __tests__/unit/hooks/useAdMutations.test.tsx
 *
 * Coverage targets (focused on the hooks MyAdsList.tsx actually uses):
 *  useMarkAsSold (report item #4 — re-added once a real "mark as sold"
 *  button needed it):
 *   - calls adsApi.markAsSold with the given ad ID
 *   - on success: invalidates both the ad-detail and my-ads queries
 *   - on success: shows a success toast
 *   - on error: shows an error toast
 *
 *  useDeleteAd:
 *   - calls adsApi.delete with the given ad ID
 *   - on success: removes the ad-detail query and invalidates list queries
 *   - on success: shows a success toast and navigates to /my-ads
 *   - on error: shows an error toast
 *
 *  useCreateAd:
 *   - calls adsApi.create with the payload (and progress callback)
 *   - on success: invalidates ads.all(), shows a success toast, navigates
 *     to the new ad's detail page
 *   - on error: shows an error toast, does not navigate
 *
 *  useUpdateAd(adId):
 *   - calls adsApi.update with adId + payload
 *   - on success: invalidates ads.all(), shows a success toast, navigates
 *     to the ad's detail page
 *   - on error: shows an error toast
 *
 *  useAddAdImages / useRemoveAdImage / useReorderAdImages:
 *   - call the matching adsApi method with the right args
 *   - on success: invalidate ads.all() and the ad's detail key (no toast)
 *   - on error: show an error toast
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useMarkAsSold,
  useDeleteAd,
  useCreateAd,
  useUpdateAd,
  useAddAdImages,
  useRemoveAdImage,
  useReorderAdImages,
} from '@/hooks/mutations/useAdMutations';
import { adsApi } from '@/api/ads.api';
import { toast } from 'sonner';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/api/ads.api', () => ({
  adsApi: {
    markAsSold: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    addImages: vi.fn(),
    removeImage: vi.fn(),
    reorderImages: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const removeSpy = vi.spyOn(queryClient, 'removeQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidateSpy, removeSpy };
}

beforeEach(() => vi.clearAllMocks());

describe('useMarkAsSold', () => {
  it('calls adsApi.markAsSold with the ad ID', async () => {
    (adsApi.markAsSold as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ad-1', status: 'SOLD' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMarkAsSold(), { wrapper });
    act(() => { result.current.mutate('ad-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.markAsSold).toHaveBeenCalledWith('ad-1');
  });

  it('invalidates the ad-detail and my-ads queries on success', async () => {
    (adsApi.markAsSold as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ad-1', status: 'SOLD' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useMarkAsSold(), { wrapper });
    act(() => { result.current.mutate('ad-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k.includes('"detail"') && k.includes('ad-1'))).toBe(true);
    expect(invalidatedKeys.some((k) => k.includes('"me"'))).toBe(true);
  });

  it('shows a success toast on success', async () => {
    (adsApi.markAsSold as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ad-1', status: 'SOLD' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMarkAsSold(), { wrapper });
    act(() => { result.current.mutate('ad-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم تعليم الإعلان كمباع');
  });

  it('does not navigate anywhere (stays on the my-ads list)', async () => {
    (adsApi.markAsSold as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ad-1', status: 'SOLD' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMarkAsSold(), { wrapper });
    act(() => { result.current.mutate('ad-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows an error toast on failure', async () => {
    (adsApi.markAsSold as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMarkAsSold(), { wrapper });
    act(() => { result.current.mutate('ad-1'); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useDeleteAd', () => {
  it('calls adsApi.delete with the ad ID', async () => {
    (adsApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteAd(), { wrapper });
    act(() => { result.current.mutate('ad-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.delete).toHaveBeenCalledWith('ad-1');
  });

  it('removes the ad-detail query and invalidates list queries on success', async () => {
    (adsApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { wrapper, removeSpy, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useDeleteAd(), { wrapper });
    act(() => { result.current.mutate('ad-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeSpy).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('shows a success toast and navigates to /my-ads on success', async () => {
    (adsApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteAd(), { wrapper });
    act(() => { result.current.mutate('ad-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم حذف الإعلان');
    expect(mockPush).toHaveBeenCalledWith('/my-ads');
  });

  it('shows an error toast and does not navigate on failure', async () => {
    (adsApi.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Cannot delete'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteAd(), { wrapper });
    act(() => { result.current.mutate('ad-1'); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('useCreateAd', () => {
  it('calls adsApi.create with the payload', async () => {
    (adsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ad-new', title: 'New Ad' } },
    });
    const { wrapper } = createWrapper();
    const payload = { title: 'New Ad', price: 100 } as unknown as Parameters<typeof adsApi.create>[0];

    const { result } = renderHook(() => useCreateAd(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.create).toHaveBeenCalledWith(payload, undefined);
  });

  it('invalidates ads.all(), shows a success toast, and navigates to the ad detail page on success', async () => {
    (adsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ad-new', title: 'New Ad' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateAd(), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof adsApi.create>[0]); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['ads']))).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('تم نشر الإعلان بنجاح');
    expect(mockPush).toHaveBeenCalledWith('/ads/ad-new');
  });

  it('shows an error toast and does not navigate on failure', async () => {
    (adsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Upload failed'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateAd(), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof adsApi.create>[0]); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('useUpdateAd', () => {
  it('calls adsApi.update with the ad ID and payload', async () => {
    (adsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ad-1', title: 'Updated' } },
    });
    const { wrapper } = createWrapper();
    const payload = { title: 'Updated' } as unknown as Parameters<typeof adsApi.update>[1];

    const { result } = renderHook(() => useUpdateAd('ad-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.update).toHaveBeenCalledWith('ad-1', payload);
  });

  it('invalidates ads.all(), shows a success toast, and navigates to the ad detail page on success', async () => {
    (adsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ad-1', title: 'Updated' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUpdateAd('ad-1'), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof adsApi.update>[1]); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['ads']))).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التعديلات');
    expect(mockPush).toHaveBeenCalledWith('/ads/ad-1');
  });

  it('shows an error toast on failure', async () => {
    (adsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateAd('ad-1'), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof adsApi.update>[1]); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useAddAdImages', () => {
  it('calls adsApi.addImages with id, files, and the progress callback', async () => {
    (adsApi.addImages as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
    const { wrapper } = createWrapper();
    const onProgress = vi.fn();
    const files = [new File(['x'], 'a.png')];

    const { result } = renderHook(() => useAddAdImages(onProgress), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', files }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.addImages).toHaveBeenCalledWith('ad-1', files, onProgress);
  });

  it('invalidates ads.all() and the ad detail key on success, without a toast', async () => {
    (adsApi.addImages as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useAddAdImages(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', files: [] }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['ads']))).toBe(true);
    expect(invalidatedKeys.some((k) => k.includes('"detail"') && k.includes('ad-1'))).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows an error toast on failure', async () => {
    (adsApi.addImages as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Upload failed'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAddAdImages(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', files: [] }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useRemoveAdImage', () => {
  it('calls adsApi.removeImage with id and imageUrl', async () => {
    (adsApi.removeImage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRemoveAdImage(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', imageUrl: 'http://x/img.png' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.removeImage).toHaveBeenCalledWith('ad-1', 'http://x/img.png');
  });

  it('invalidates ads.all() and the ad detail key on success', async () => {
    (adsApi.removeImage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useRemoveAdImage(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', imageUrl: 'http://x/img.png' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['ads']))).toBe(true);
    expect(invalidatedKeys.some((k) => k.includes('"detail"') && k.includes('ad-1'))).toBe(true);
  });

  it('shows an error toast on failure', async () => {
    (adsApi.removeImage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Cannot remove'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRemoveAdImage(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', imageUrl: 'http://x/img.png' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useReorderAdImages', () => {
  it('calls adsApi.reorderImages with id and images', async () => {
    (adsApi.reorderImages as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
    const { wrapper } = createWrapper();
    const images = ['http://x/1.png', 'http://x/2.png'];

    const { result } = renderHook(() => useReorderAdImages(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', images }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.reorderImages).toHaveBeenCalledWith('ad-1', images);
  });

  it('invalidates ads.all() and the ad detail key on success', async () => {
    (adsApi.reorderImages as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useReorderAdImages(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', images: [] }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['ads']))).toBe(true);
    expect(invalidatedKeys.some((k) => k.includes('"detail"') && k.includes('ad-1'))).toBe(true);
  });

  it('shows an error toast on failure', async () => {
    (adsApi.reorderImages as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Reorder failed'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useReorderAdImages(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', images: [] }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});
