/**
 * __tests__/components/AvailabilityCalendar.test.tsx
 *
 * Previously uncovered (0%), ~75 lines. Single-day availability picker
 * (not a month grid — backend has no bulk-range availability endpoint)
 * backed by GET /appointments/availability/:providerId?date=.
 *
 * Coverage targets:
 *  - Loading state renders a spinner
 *  - Error state renders a retry button that calls refetch
 *  - available: false renders the "no availability" empty state, not
 *    the free-ranges grid
 *  - available: true renders one button per freeRanges entry, labeled
 *    with formatted start–end times
 *  - Clicking a free-range button calls onSelectRange with that range
 *  - Changing the date input re-invokes useAvailability with the new date
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AvailabilityCalendar } from '@/components/services/AvailabilityCalendar';
import { useAvailability } from '@/hooks/queries/useAppointments';
import { formatTime } from '@/lib/formatters';
import type { AvailabilityResponse } from '@/types/service.types';

vi.mock('@/hooks/queries/useAppointments', () => ({
  useAvailability: vi.fn(),
}));

function mockAvailabilityState(overrides: Partial<ReturnType<typeof useAvailability>>) {
  vi.mocked(useAvailability).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AvailabilityCalendar', () => {
  it('shows a spinner while loading', () => {
    mockAvailabilityState({ isLoading: true });
    render(<AvailabilityCalendar providerId="provider-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error message with a working retry button', async () => {
    const refetch = vi.fn();
    mockAvailabilityState({ isError: true, refetch });
    const user = setupUser();
    render(<AvailabilityCalendar providerId="provider-1" />);

    expect(screen.getByText('تعذّر تحميل الأوقات المتاحة')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the "no availability" empty state when available is false', () => {
    const data: AvailabilityResponse = { date: '2026-02-01', available: false, freeRanges: [] };
    mockAvailabilityState({ data });
    render(<AvailabilityCalendar providerId="provider-1" />);
    expect(screen.getByText('لا توجد أوقات متاحة')).toBeInTheDocument();
  });

  it('renders one button per free range with formatted start–end times', () => {
    const data: AvailabilityResponse = {
      date: '2026-02-01',
      available: true,
      freeRanges: [
        { start: '2026-02-01T09:00:00.000Z', end: '2026-02-01T10:00:00.000Z' },
        { start: '2026-02-01T11:00:00.000Z', end: '2026-02-01T12:00:00.000Z' },
      ],
    };
    mockAvailabilityState({ data });
    render(<AvailabilityCalendar providerId="provider-1" />);

    const expectedLabel1 = `${formatTime(data.freeRanges[0].start)} – ${formatTime(data.freeRanges[0].end)}`;
    const expectedLabel2 = `${formatTime(data.freeRanges[1].start)} – ${formatTime(data.freeRanges[1].end)}`;
    expect(screen.getByText(expectedLabel1)).toBeInTheDocument();
    expect(screen.getByText(expectedLabel2)).toBeInTheDocument();
  });

  it('does not render the empty state when available is true', () => {
    const data: AvailabilityResponse = {
      date: '2026-02-01',
      available: true,
      freeRanges: [{ start: '2026-02-01T09:00:00.000Z', end: '2026-02-01T10:00:00.000Z' }],
    };
    mockAvailabilityState({ data });
    render(<AvailabilityCalendar providerId="provider-1" />);
    expect(screen.queryByText('لا توجد أوقات متاحة')).not.toBeInTheDocument();
  });

  it('calls onSelectRange with the clicked range', async () => {
    const range = { start: '2026-02-01T09:00:00.000Z', end: '2026-02-01T10:00:00.000Z' };
    const data: AvailabilityResponse = { date: '2026-02-01', available: true, freeRanges: [range] };
    mockAvailabilityState({ data });
    const onSelectRange = vi.fn();
    const user = setupUser();
    render(<AvailabilityCalendar providerId="provider-1" onSelectRange={onSelectRange} />);

    await user.click(screen.getByText(`${formatTime(range.start)} – ${formatTime(range.end)}`));

    expect(onSelectRange).toHaveBeenCalledWith(range);
  });

  it('re-fetches availability for a new date when the date input changes', () => {
    mockAvailabilityState({ data: { date: '2026-02-01', available: false, freeRanges: [] } });
    render(<AvailabilityCalendar providerId="provider-1" />);

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-03-15' } });

    expect(useAvailability).toHaveBeenLastCalledWith('provider-1', '2026-03-15');
  });
});
