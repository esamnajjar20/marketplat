/**
 * __tests__/unit/hooks/useServiceReviewMutations.test.tsx
 *
 * Previously uncovered. useCreateServiceReview deliberately invalidates
 * the whole `service-reviews` key prefix (not a scoped seller key)
 * because the mutation only knows requestId, not which seller profile
 * it resolves to server-side — its own comment documents that tradeoff
 * explicitly. It also invalidates service-requests/me so the "already
 * reviewed" UI state updates without waiting for CACHE_TTL to lapse.
 * Both invalidations matter independently and are easy to drop one of
 * during a refactor without either failing loudly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateServiceReview } from '@/hooks/mutations/useServiceReviewMutations';
import { serviceReviewsApi } from '@/api/service-reviews.api';
import { toast } from 'sonner';

vi.mock('@/api/service-reviews.api', () => ({
  serviceReviewsApi: { create: vi.fn() },
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

describe('useCreateServiceReview', () => {
  it('calls serviceReviewsApi.create with the payload', async () => {
    (serviceReviewsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'rev-1' } },
    });
    const { wrapper } = createWrapper();
    const payload = { requestId: 'req-1', score: 5, comment: 'ممتاز' } as never;

    const { result } = renderHook(() => useCreateServiceReview(), { wrapper });
    act(() => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(serviceReviewsApi.create).toHaveBeenCalledWith(payload);
  });

  it('invalidates both the service-reviews prefix and service-requests/me on success', async () => {
    (serviceReviewsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'rev-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateServiceReview(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(['service-reviews']);
    expect(keys).toContainEqual(['service-requests', 'me']);
  });

  it('does not touch the provider-side incoming list (reviews are customer-only)', async () => {
    (serviceReviewsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'rev-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateServiceReview(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys(invalidateSpy)).not.toContainEqual(['service-requests', 'incoming']);
  });

  it('shows a success toast', async () => {
    (serviceReviewsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'rev-1' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateServiceReview(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إرسال تقييمك بنجاح');
  });

  it('shows an error toast and invalidates nothing on failure (e.g. reviewing a non-COMPLETED request)', async () => {
    (serviceReviewsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { message: 'لا يمكن تقييم طلب غير مكتمل' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateServiceReview(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
