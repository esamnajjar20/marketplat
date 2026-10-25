/**
 * __tests__/unit/hooks/useStoreReviewMutations.test.tsx
 *
 * Previously uncovered. useCreateStoreReview invalidates both the
 * store's review list AND the store detail query — the latter
 * specifically because the rating aggregate is embedded in the store
 * detail response rather than computed client-side, so without that
 * second invalidation the new average wouldn't show until CACHE_TTL
 * lapses. Both keys are scoped to storeId (unlike the broader
 * service-reviews prefix invalidation used for service reviews), so
 * this also checks the mutation doesn't accidentally invalidate a
 * different store's cache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateStoreReview } from '@/hooks/mutations/useStoreReviewMutations';
import { storesApi } from '@/api/stores.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

vi.mock('@/api/stores.api', () => ({
  storesApi: { createReview: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

function invalidatedKeys(invalidateSpy: ReturnType<typeof vi.fn>): unknown[][] {
  return invalidateSpy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
}

beforeEach(() => vi.clearAllMocks());

describe('useCreateStoreReview', () => {
  it('calls storesApi.createReview with the store id and payload', async () => {
    (storesApi.createReview as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: null },
    });
    const { wrapper } = createWrapper();
    const payload = { score: 4, comment: 'جيد' } as never;

    const { result } = renderHook(() => useCreateStoreReview('store-1'), { wrapper });
    act(() => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(storesApi.createReview).toHaveBeenCalledWith('store-1', payload);
  });

  it('invalidates the review list and the store detail query for that store on success', async () => {
    (storesApi.createReview as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: null },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateStoreReview('store-1'), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(queryKeys.storeReviews.forStore('store-1'));
    expect(keys).toContainEqual(queryKeys.stores.detail('store-1'));
  });

  it('does not invalidate a different store\'s cache', async () => {
    (storesApi.createReview as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: null },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateStoreReview('store-1'), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).not.toContainEqual(queryKeys.stores.detail('store-2'));
    expect(keys).not.toContainEqual(queryKeys.storeReviews.forStore('store-2'));
  });

  it('shows a success toast', async () => {
    (storesApi.createReview as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: null },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateStoreReview('store-1'), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إرسال تقييمك بنجاح');
  });

  it('shows an error toast and invalidates nothing on failure (e.g. already reviewed this store)', async () => {
    (storesApi.createReview as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { message: 'لقد قيّمت هذا المتجر مسبقًا' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateStoreReview('store-1'), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
