/**
 * __tests__/unit/hooks/useAppointmentMutations.test.tsx
 *
 * Previously uncovered. useCreateAppointment's own comment documents a
 * real shipped bug (UX-01): it *claimed* to invalidate service-request
 * caches when a booking was tied to a request, but never actually did —
 * so a provider with MyServiceRequestsList/IncomingServiceRequestsList
 * open kept seeing a stale request after booking against it. That's
 * exactly the kind of "comment says X, code does Y" drift that only a
 * test — not a doc comment — reliably catches on the next refactor.
 *
 * Coverage:
 *  useCreateAppointment:
 *   - calls appointmentsApi.create with the payload
 *   - always invalidates ['appointments','me'] on success
 *   - when appointment.providerId is present: also invalidates
 *     ['appointments','availability']
 *   - when appointment.requestId is present: also invalidates
 *     ['service-requests','me'] and ['service-requests','incoming']
 *     (the UX-01 regression path)
 *   - when appointment has neither providerId nor requestId: only the
 *     unconditional invalidation fires, nothing extra
 *   - shows a success toast
 *   - shows an error toast and does not invalidate anything on failure
 *
 *  useUpdateAppointmentStatus:
 *   - calls appointmentsApi.updateStatus with id + payload
 *   - invalidates both queryKeys.appointments.mine() and the legacy
 *     ['appointments','me'] key on success
 *   - shows a success toast
 *   - shows an error toast on failure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateAppointment,
  useUpdateAppointmentStatus,
} from '@/hooks/mutations/useAppointmentMutations';
import { appointmentsApi } from '@/api/appointments.api';
import { toast } from 'sonner';

vi.mock('@/api/appointments.api', () => ({
  appointmentsApi: {
    create: vi.fn(),
    updateStatus: vi.fn(),
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

describe('useCreateAppointment', () => {
  it('calls appointmentsApi.create with the payload', async () => {
    (appointmentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'appt-1' } },
    });
    const { wrapper } = createWrapper();
    const payload = { providerId: 'sp-1', startTime: '2026-08-20T10:00:00Z' } as never;

    const { result } = renderHook(() => useCreateAppointment(), { wrapper });
    act(() => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(appointmentsApi.create).toHaveBeenCalledWith(payload);
  });

  it('always invalidates the appointments/me list on success', async () => {
    (appointmentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'appt-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateAppointment(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys(invalidateSpy)).toContainEqual(['appointments', 'me']);
  });

  it('invalidates availability when the appointment has a providerId', async () => {
    (appointmentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'appt-1', providerId: 'sp-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateAppointment(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys(invalidateSpy)).toContainEqual(['appointments', 'availability']);
  });

  it('invalidates both service-request lists when the appointment has a requestId (UX-01 regression guard)', async () => {
    (appointmentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'appt-1', requestId: 'req-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateAppointment(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(['service-requests', 'me']);
    expect(keys).toContainEqual(['service-requests', 'incoming']);
  });

  it('does not touch availability or service-request keys when neither providerId nor requestId is present', async () => {
    (appointmentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'appt-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateAppointment(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).not.toContainEqual(['appointments', 'availability']);
    expect(keys).not.toContainEqual(['service-requests', 'me']);
    expect(keys).not.toContainEqual(['service-requests', 'incoming']);
  });

  it('shows a success toast on success', async () => {
    (appointmentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'appt-1' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateAppointment(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم حجز الموعد بنجاح');
  });

  it('shows an error toast and invalidates nothing on failure', async () => {
    (appointmentsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { message: 'الوقت غير متاح' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateAppointment(), { wrapper });
    act(() => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useUpdateAppointmentStatus', () => {
  it('calls appointmentsApi.updateStatus with id and payload', async () => {
    (appointmentsApi.updateStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'appt-1', status: 'COMPLETED' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateAppointmentStatus(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'appt-1', payload: { status: 'COMPLETED' } as never });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(appointmentsApi.updateStatus).toHaveBeenCalledWith('appt-1', { status: 'COMPLETED' });
  });

  it('invalidates both the shared appointments-mine key and the legacy appointments/me key', async () => {
    (appointmentsApi.updateStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'appt-1', status: 'COMPLETED' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUpdateAppointmentStatus(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'appt-1', payload: { status: 'COMPLETED' } as never });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(['appointments', 'me', {}]);
    expect(keys).toContainEqual(['appointments', 'me']);
  });

  it('shows a success toast on success', async () => {
    (appointmentsApi.updateStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'appt-1', status: 'CANCELLED' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateAppointmentStatus(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'appt-1', payload: { status: 'CANCELLED' } as never });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم تحديث حالة الموعد');
  });

  it('shows an error toast on failure (e.g. illegal transition rejected server-side)', async () => {
    (appointmentsApi.updateStatus as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { message: 'لا يمكن تعديل موعد غير محجوز' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateAppointmentStatus(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'appt-1', payload: { status: 'COMPLETED' } as never });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});
