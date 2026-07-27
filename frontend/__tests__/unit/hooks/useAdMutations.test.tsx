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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMarkAsSold, useDeleteAd } from '@/hooks/mutations/useAdMutations';
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
