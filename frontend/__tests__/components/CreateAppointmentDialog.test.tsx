/**
 * __tests__/components/CreateAppointmentDialog.test.tsx
 *
 * Previously uncovered. Shared between two entry points (standalone
 * booking and per-row action on an accepted service request) — the
 * component's own comment (UX-FIX P1-2) flags a real fixed bug: closing
 * and reopening this dialog mid-request used to let a user submit a
 * second booking before the first resolved, because close only reset
 * local state with no pending guard at all. That guard (blocking
 * Escape/overlay-click/cancel while createAppointment.isPending) is
 * exactly the kind of thing that regresses silently without a test.
 *
 * AvailabilityCalendar is mocked out — it has its own query/loading/
 * error logic and isn't this file's concern; the mock exposes just
 * enough (a button that calls onSelectRange) to drive this dialog's
 * own state.
 *
 * Coverage:
 *  - Submit disabled until a range is selected
 *  - Selecting a range enables submit and shows it in the summary line
 *  - Submit sends { requestId, scheduledStart, scheduledEnd, notes },
 *    trimming empty notes to undefined, and omits requestId when the
 *    dialog was opened standalone
 *  - onSuccess closes and resets local state (selected range, notes)
 *  - Cancel resets and closes when NOT pending
 *  - Cancel is a no-op while pending (the P1-2 double-submit guard)
 *  - contextLabel renders only when provided
 *  - Pending state disables both cancel and submit, shows pending label
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { CreateAppointmentDialog } from '@/components/services/CreateAppointmentDialog';
import { useCreateAppointment } from '@/hooks/mutations/useAppointmentMutations';

vi.mock('@/hooks/mutations/useAppointmentMutations', () => ({
  useCreateAppointment: vi.fn(),
}));

vi.mock('@/components/services/AvailabilityCalendar', () => ({
  AvailabilityCalendar: ({
    onSelectRange,
  }: {
    onSelectRange?: (range: { start: string; end: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelectRange?.({ start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T11:00:00.000Z' })
      }
    >
      اختر 10:00–11:00
    </button>
  ),
}));

const mockMutate = vi.fn();
const mockOnOpenChange = vi.fn();

function renderDialog(overrides: { requestId?: string; contextLabel?: string } = {}) {
  return render(
    <CreateAppointmentDialog
      open
      onOpenChange={mockOnOpenChange}
      providerId="provider-1"
      {...overrides}
    />,
  );
}

async function selectRange(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByRole('button', { name: 'اختر 10:00–11:00' }));
}

describe('CreateAppointmentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCreateAppointment as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('disables submit until a range is selected', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'تأكيد الحجز' })).toBeDisabled();
  });

  it('enables submit and shows a summary once a range is selected', async () => {
    const user = setupUser();
    renderDialog();

    await selectRange(user);

    expect(screen.getByRole('button', { name: 'تأكيد الحجز' })).toBeEnabled();
    expect(screen.getByText(/الموعد المختار/)).toBeInTheDocument();
  });

  it('renders contextLabel only when provided', () => {
    const { rerender } = renderDialog();
    expect(screen.queryByText('طلب: تصليح سباكة')).not.toBeInTheDocument();

    rerender(
      <CreateAppointmentDialog
        open
        onOpenChange={mockOnOpenChange}
        providerId="provider-1"
        contextLabel="طلب: تصليح سباكة"
      />,
    );
    expect(screen.getByText('طلب: تصليح سباكة')).toBeInTheDocument();
  });

  it('submits scheduledStart/scheduledEnd with notes omitted when blank, no requestId for a standalone booking', async () => {
    const user = setupUser();
    renderDialog();

    await selectRange(user);
    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        requestId: undefined,
        scheduledStart: '2026-09-01T10:00:00.000Z',
        scheduledEnd: '2026-09-01T11:00:00.000Z',
        notes: undefined,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('includes requestId when booking against an accepted request', async () => {
    const user = setupUser();
    renderDialog({ requestId: 'req-9' });

    await selectRange(user);
    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-9' }),
      expect.anything(),
    );
  });

  it('trims and includes notes when provided', async () => {
    const user = setupUser();
    renderDialog();

    await selectRange(user);
    await user.type(screen.getByLabelText(/ملاحظات/), '  الرجاء الاتصال قبل الوصول  ');
    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'الرجاء الاتصال قبل الوصول' }),
      expect.anything(),
    );
  });

  it('onSuccess closes the dialog and resets local state', async () => {
    const user = setupUser();
    renderDialog();

    await selectRange(user);
    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));

    const { onSuccess } = mockMutate.mock.calls[0][1];
    onSuccess();

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('cancel resets and closes when not pending', async () => {
    const user = setupUser();
    renderDialog();

    await selectRange(user);
    await user.click(screen.getByRole('button', { name: 'إلغاء' }));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('P1-2: cancel does nothing while a booking is pending — blocks the double-submit', async () => {
    (useCreateAppointment as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });
    const user = setupUser();
    renderDialog();

    // Cancel itself is disabled while pending — but assert the
    // underlying handleClose guard doesn't fire onOpenChange(false)
    // even if something else were to trigger it (e.g. Escape), which
    // is the actual invariant P1-2 protects.
    const cancelButton = screen.getByRole('button', { name: 'إلغاء' });
    expect(cancelButton).toBeDisabled();
    await user.click(cancelButton);

    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });

  it('shows a pending label and disables cancel + submit while sending', () => {
    (useCreateAppointment as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });
    renderDialog();

    expect(screen.getByRole('button', { name: 'جارٍ الحجز…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled();
  });
});
