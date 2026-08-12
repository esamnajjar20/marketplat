/**
 * __tests__/components/AppointmentsList.test.tsx
 *
 * Previously uncovered (0%), ~180 lines. Provider-side appointments
 * calendar at /my-services/appointments — same URL-driven pagination
 * and out-of-range recovery shape as IncomingServiceRequestsList, with
 * a status-gated action row (only SCHEDULED appointments get actions)
 * and a "حجز موعد جديد" button that opens CreateAppointmentDialog
 * standalone (no requestId).
 *
 * Coverage targets:
 *  - Loading state shows a spinner
 *  - Error state shows a retry button that calls refetch
 *  - Empty state shown when there are no appointments
 *  - Renders formatted date/time, status badge, and notes (when present)
 *  - AppointmentActions: SCHEDULED shows لم يحضر/إلغاء/إنهاء, calling
 *    updateStatus.mutate with the right { id, payload: { status } };
 *    COMPLETED/CANCELLED/NO_SHOW show no actions
 *  - "حجز موعد جديد" opens CreateAppointmentDialog with the given
 *    providerId and no requestId
 *  - Out-of-range page recovery: spinner (not empty state) when page
 *    exceeds totalPages
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentsList } from '@/components/services/AppointmentsList';
import { useMyAppointments } from '@/hooks/queries/useAppointments';
import { useUpdateAppointmentStatus } from '@/hooks/mutations/useAppointmentMutations';
import { formatDateTime } from '@/lib/formatters';
import type { Appointment, AppointmentStatus } from '@/types/service.types';

let mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/queries/useAppointments', () => ({
  useMyAppointments: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAppointmentMutations', () => ({
  useUpdateAppointmentStatus: vi.fn(),
}));

vi.mock('@/components/services/CreateAppointmentDialog', () => ({
  CreateAppointmentDialog: ({
    open, providerId, requestId,
  }: { open: boolean; providerId: string; requestId?: string }) =>
    open ? <div data-testid="appointment-dialog">{providerId}:{requestId ?? 'none'}</div> : null,
}));

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    providerId: 'provider-1',
    requestId: null,
    scheduledStart: '2026-02-01T10:00:00.000Z',
    scheduledEnd: '2026-02-01T11:00:00.000Z',
    status: 'SCHEDULED',
    notes: 'إحضار الأدوات',
    createdAt: '2026-01-20T00:00:00.000Z',
    updatedAt: '2026-01-20T00:00:00.000Z',
    ...overrides,
  };
}

const mockUpdateMutate = vi.fn();

function mockAppointmentsState(overrides: Partial<ReturnType<typeof useMyAppointments>>) {
  vi.mocked(useMyAppointments).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  vi.mocked(useUpdateAppointmentStatus).mockReturnValue({
    mutate: mockUpdateMutate,
    isPending: false,
  } as never);
});

describe('AppointmentsList', () => {
  it('shows a loading spinner while fetching', () => {
    mockAppointmentsState({ isLoading: true });
    render(<AppointmentsList providerId="provider-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with a retry option that calls refetch', async () => {
    const refetch = vi.fn();
    mockAppointmentsState({ isError: true, refetch });
    const user = userEvent.setup();
    render(<AppointmentsList providerId="provider-1" />);

    expect(screen.getByText('حدث خطأ أثناء تحميل المواعيد')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no appointments', () => {
    mockAppointmentsState({ data: { items: [], meta: { totalPages: 1 } } });
    render(<AppointmentsList providerId="provider-1" />);
    expect(screen.getByText('لا توجد مواعيد')).toBeInTheDocument();
  });

  it('renders the formatted date/time, status badge, and notes', () => {
    const appt = makeAppointment({ status: 'SCHEDULED', notes: 'إحضار الأدوات' });
    mockAppointmentsState({ data: { items: [appt], meta: { totalPages: 1 } } });
    render(<AppointmentsList providerId="provider-1" />);
    expect(screen.getByText(formatDateTime(appt.scheduledStart))).toBeInTheDocument();
    expect(screen.getByText('محجوز')).toBeInTheDocument();
    expect(screen.getByText('إحضار الأدوات')).toBeInTheDocument();
  });

  it('does not render a notes paragraph when notes is null', () => {
    mockAppointmentsState({
      data: { items: [makeAppointment({ notes: null })], meta: { totalPages: 1 } },
    });
    render(<AppointmentsList providerId="provider-1" />);
    expect(screen.queryByText('إحضار الأدوات')).not.toBeInTheDocument();
  });

  describe('appointment actions', () => {
    it('shows لم يحضر / إلغاء / إنهاء for a SCHEDULED appointment and calls updateStatus.mutate correctly', async () => {
      mockAppointmentsState({
        data: { items: [makeAppointment({ id: 'appt-9', status: 'SCHEDULED' })], meta: { totalPages: 1 } },
      });
      const user = userEvent.setup();
      render(<AppointmentsList providerId="provider-1" />);

      await user.click(screen.getByRole('button', { name: /لم يحضر/ }));
      expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 'appt-9', payload: { status: 'NO_SHOW' } });

      await user.click(screen.getByRole('button', { name: /إلغاء/ }));
      expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 'appt-9', payload: { status: 'CANCELLED' } });

      await user.click(screen.getByRole('button', { name: /إنهاء/ }));
      expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 'appt-9', payload: { status: 'COMPLETED' } });
    });

    it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'] as AppointmentStatus[])(
      'shows no action buttons for a %s appointment',
      (status) => {
        mockAppointmentsState({
          data: { items: [makeAppointment({ status })], meta: { totalPages: 1 } },
        });
        render(<AppointmentsList providerId="provider-1" />);
        expect(screen.queryByRole('button', { name: /لم يحضر|إلغاء|إنهاء/ })).not.toBeInTheDocument();
      },
    );
  });

  describe('new appointment button', () => {
    it('opens CreateAppointmentDialog standalone (no requestId) when "حجز موعد جديد" is clicked', async () => {
      mockAppointmentsState({ data: { items: [], meta: { totalPages: 1 } } });
      const user = userEvent.setup();
      render(<AppointmentsList providerId="provider-42" />);

      await user.click(screen.getByRole('button', { name: /حجز موعد جديد/ }));

      expect(screen.getByTestId('appointment-dialog')).toHaveTextContent('provider-42:none');
    });
  });

  it('shows a spinner (not the empty state) when the current page exceeds totalPages', () => {
    mockSearchParams = new URLSearchParams('page=5');
    mockAppointmentsState({ data: { items: [], meta: { totalPages: 2 } } });
    render(<AppointmentsList providerId="provider-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد مواعيد')).not.toBeInTheDocument();
  });
});
