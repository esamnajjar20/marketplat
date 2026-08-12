/**
 * __tests__/unit/hooks/useServiceRequestMutations.test.tsx
 *
 * Previously uncovered despite backing both sides of the service-request
 * flow (customer creates, either side responds/advances status).
 * useRespondToServiceRequest's three-way invalidation (detail + both
 * "me"/"incoming" lists) is exactly the kind of "I invalidate several
 * different things for different reasons" logic that silently rots when
 * someone "simplifies" it during an unrelated refactor — pinning it down
 * here.
 *
 * Coverage:
 *  useCreateServiceRequest:
 *   - calls serviceRequestsApi.create with the payload
 *   - invalidates ['service-requests','me'] on success
 *   - shows a success toast
 *   - shows an error toast and invalidates nothing on failure
 *
 *  useRespondToServiceRequest(id):
 *   - calls serviceRequestsApi.respond with id + payload
 *   - invalidates the request's own detail key, plus both 'me' and
 *     'incoming' lists on success (so whichever side has it open sees
 *     the update)
 *   - shows a success toast
 *   - shows an error toast on failure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateServiceRequest,
  useRespondToServiceRequest,
} from '@/hooks/mutations/useServiceRequestMutations';
import { serviceRequestsApi } from '@/api/service-requests.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

vi.mock('@/api/service-requests.api', () => ({
  serviceRequestsApi: {
    create: vi.fn(),
    respond: vi.fn(),
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
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidateSpy };
}

function invalidatedKeys(invalidateSpy: ReturnType<typeof vi.fn>): unknown[][] {
  return invalidateSpy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
}

beforeEach(() => vi.clearAllMocks());

describe('useCreateServiceRequest', () => {
  it('calls serviceRequestsApi.create with the payload', async () => {
    (serviceRequestsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'req-1' } },
    });
    const { wrapper } = createWrapper();
    const payload = { listingId: 'sl-1', message: 'أحتاج الخدمة غدًا' } as never;

    const { result } = renderHook(() => useCreateServiceRequest(), { wrapper });
    act(() => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(serviceRequestsApi.create).toHaveBeenCalledWith(payload);
  });

  it('invalidates the customer\'s "my requests" list on success', async () => {
    (serviceRequestsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'req-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateServiceRequest(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys(invalidateSpy)).toContainEqual(['service-requests', 'me']);
  });

  it('shows a success toast', async () => {
    (serviceRequestsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'req-1' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateServiceRequest(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إرسال طلبك بنجاح');
  });

  it('shows an error toast and invalidates nothing on failure', async () => {
    (serviceRequestsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { message: 'فشل الطلب' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateServiceRequest(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useRespondToServiceRequest', () => {
  it('calls serviceRequestsApi.respond with the id and payload', async () => {
    (serviceRequestsApi.respond as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'req-1', status: 'ACCEPTED' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRespondToServiceRequest('req-1'), { wrapper });
    act(() => {
      result.current.mutate({ action: 'ACCEPTED' } as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(serviceRequestsApi.respond).toHaveBeenCalledWith('req-1', { action: 'ACCEPTED' });
  });

  it('invalidates the detail view and both the customer and provider lists on success', async () => {
    (serviceRequestsApi.respond as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'req-1', status: 'ACCEPTED' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useRespondToServiceRequest('req-1'), { wrapper });
    act(() => {
      result.current.mutate({ action: 'ACCEPTED' } as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(queryKeys.serviceRequests.detail('req-1'));
    expect(keys).toContainEqual(['service-requests', 'me']);
    expect(keys).toContainEqual(['service-requests', 'incoming']);
  });

  it('scopes detail invalidation to the given id, not some other request', async () => {
    (serviceRequestsApi.respond as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'req-1', status: 'ACCEPTED' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useRespondToServiceRequest('req-1'), { wrapper });
    act(() => {
      result.current.mutate({ action: 'ACCEPTED' } as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).not.toContainEqual(queryKeys.serviceRequests.detail('req-2'));
  });

  it('shows a success toast', async () => {
    (serviceRequestsApi.respond as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'req-1', status: 'REJECTED' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRespondToServiceRequest('req-1'), { wrapper });
    act(() => {
      result.current.mutate({ action: 'REJECTED' } as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم تحديث حالة الطلب');
  });

  it('shows an error toast on failure (e.g. illegal transition rejected server-side)', async () => {
    (serviceRequestsApi.respond as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { message: 'انتقال حالة غير مسموح' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRespondToServiceRequest('req-1'), { wrapper });
    act(() => {
      result.current.mutate({ action: 'COMPLETED' } as never);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});
