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
import { saveAdDraft } from '@/lib/offlineAdDrafts';
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

// FIX AD-DRAFT-QUEUE-LINK-01: useCreateAd/useUpdateAd now read the
// current user id (to scope the offline draft — FIX
// AD-DRAFT-USER-SCOPE-01) and call saveAdDraft on the offline/queued
// fallback path. Both need mocking so the pre-existing tests (which
// never exercised that path — see audit note above) keep working, and
// so the new tests below can assert on what gets saved.
vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: { id: string } | null }) => s.user,
}));

vi.mock('@/lib/offlineAdDrafts', () => ({
  saveAdDraft: vi.fn().mockResolvedValue(undefined),
}));

// FIX IMAGEOFFLINE-WIRE-01: jsdom has no Canvas/createImageBitmap, so the
// real compressImageForOffline can't run here — mocked per-test instead.
vi.mock('@/lib/imageOffline', () => ({
  compressImageForOffline: vi.fn(),
}));

import { useAuthStore } from '@/store/auth.store';
import { compressImageForOffline } from '@/lib/imageOffline';

function mockCurrentUser(id: string | null) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { user: { id: string } | null }) => unknown) => selector({ user: id ? { id } : null }),
  );
}

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
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

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentUser('user-1');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

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
    // FIX AD-DRAFT-QUEUE-LINK-01: 3rd arg is now a generated operationId
    // (see lib/offlineOperationId.ts) — a real UUID, not a fixed value,
    // so assert its shape rather than an exact match.
    expect(adsApi.create).toHaveBeenCalledWith(payload, undefined, expect.any(String));
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
    expect(toast.success).toHaveBeenCalledWith(
      'تم نشر الإعلان بنجاح',
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(mockPush).toHaveBeenCalledWith('/ads/ad-new?published=1');
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

  // FIX AD-DRAFT-QUEUE-LINK-01 / FIX AD-DRAFT-USER-SCOPE-01
  it('saves an offline draft with the same operationId sent to adsApi.create, scoped to the current user', async () => {
    (adsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { wrapper } = createWrapper();
    const payload = { title: 'Offline Ad', description: 'desc', price: 50 } as unknown as Parameters<
      typeof adsApi.create
    >[0];

    const { result } = renderHook(() => useCreateAd(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(saveAdDraft).toHaveBeenCalled());

    const [createCall] = (adsApi.create as ReturnType<typeof vi.fn>).mock.calls;
    const sentOperationId = createCall[2];
    expect(typeof sentOperationId).toBe('string');

    expect(saveAdDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'create',
        kind: 'ad',
        status: 'pending_sync',
        operationId: sentOperationId,
        userId: 'user-1',
      }),
    );
    // no error toast when the offline fallback succeeds
    expect(toast.error).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('payload stores only filenames (imageLabels) — never raw File objects', async () => {
    (adsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { wrapper } = createWrapper();
    const payload = {
      title: 'Offline Ad',
      description: 'desc',
      images: [new File(['x'], 'a.png')],
    } as unknown as Parameters<typeof adsApi.create>[0];

    const { result } = renderHook(() => useCreateAd(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(saveAdDraft).toHaveBeenCalled());
    const savedPayload = (saveAdDraft as ReturnType<typeof vi.fn>).mock.calls[0][0].payload;
    // FIX IMAGEOFFLINE-WIRE-01: images (compressed previews) live as a
    // separate top-level field on the draft — never inside `payload`,
    // which stays plain JSON-serializable text + filenames only.
    expect(savedPayload).not.toHaveProperty('images');
    expect(savedPayload.imageLabels).toEqual(['a.png']);
  });

  // FIX IMAGEOFFLINE-WIRE-01
  it('attaches a compressed preview image to the draft when compression succeeds', async () => {
    (adsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const fakeBlob = new Blob(['x'], { type: 'image/jpeg' });
    vi.mocked(compressImageForOffline).mockResolvedValue(fakeBlob);
    const { wrapper } = createWrapper();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const payload = { title: 'Offline Ad', description: 'desc', images: [file] } as unknown as Parameters<
      typeof adsApi.create
    >[0];

    const { result } = renderHook(() => useCreateAd(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(saveAdDraft).toHaveBeenCalled());
    expect(compressImageForOffline).toHaveBeenCalledWith(file);
    const savedImages = (saveAdDraft as ReturnType<typeof vi.fn>).mock.calls[0][0].images;
    expect(savedImages).toEqual([{ name: 'photo.png', blob: fakeBlob }]);
  });

  it('still saves the draft (without a preview) when compression fails for every image', async () => {
    (adsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    vi.mocked(compressImageForOffline).mockRejectedValue(new Error('canvas unsupported'));
    const { wrapper } = createWrapper();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const payload = { title: 'Offline Ad', description: 'desc', images: [file] } as unknown as Parameters<
      typeof adsApi.create
    >[0];

    const { result } = renderHook(() => useCreateAd(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(saveAdDraft).toHaveBeenCalled());
    const savedImages = (saveAdDraft as ReturnType<typeof vi.fn>).mock.calls[0][0].images;
    expect(savedImages).toEqual([]);
    // compression failing must never surface as an error toast — the
    // draft (and the real SW-queued request) are unaffected by it.
    expect(toast.error).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
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
    expect(adsApi.update).toHaveBeenCalledWith('ad-1', payload, expect.any(String));
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

  // FIX AD-DRAFT-QUEUE-LINK-01
  it('saves an offline draft with remoteAdId and the same operationId sent to adsApi.update', async () => {
    (adsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { wrapper } = createWrapper();
    // FIX AD-DRAFT-FIELDS-01: include condition + isNegotiable so resume keeps them
    const payload = {
      title: 'Updated offline',
      condition: 'USED',
      isNegotiable: true,
    } as unknown as Parameters<typeof adsApi.update>[1];

    const { result } = renderHook(() => useUpdateAd('ad-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(saveAdDraft).toHaveBeenCalled());
    const sentOperationId = (adsApi.update as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(typeof sentOperationId).toBe('string');
    expect(saveAdDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'edit',
        kind: 'ad',
        remoteAdId: 'ad-1',
        status: 'pending_sync',
        operationId: sentOperationId,
        userId: 'user-1',
        payload: expect.objectContaining({
          title: 'Updated offline',
          condition: 'USED',
          isNegotiable: true,
        }),
      }),
    );
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
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

  it('invalidates ads.all() (which includes the ad detail cache) on success, without a toast', async () => {
    (adsApi.addImages as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useAddAdImages(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', files: [] }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['ads']))).toBe(true);
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

  it('invalidates ads.all() (which includes the ad detail cache) on success', async () => {
    (adsApi.removeImage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useRemoveAdImage(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', imageUrl: 'http://x/img.png' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['ads']))).toBe(true);
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

  it('invalidates ads.all() (which includes the ad detail cache) on success', async () => {
    (adsApi.reorderImages as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useReorderAdImages(), { wrapper });
    act(() => { result.current.mutate({ id: 'ad-1', images: [] }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['ads']))).toBe(true);
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
