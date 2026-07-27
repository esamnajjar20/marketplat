/**
 * __tests__/components/DeleteAccountSection.test.tsx
 *
 * FIX INTEG-08: covers the account-deletion UI that finally calls the
 * previously-unreachable useDeleteAccount mutation. Real logic:
 *   - Delete is disabled until the user types the exact confirmation
 *     word — this is the whole safety mechanism for an irreversible
 *     action, so it's the one thing that must be tested precisely.
 *   - Reopening the dialog clears any previously typed confirmation
 *     text (no accidental instant-delete on a second open).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteAccountSection } from '@/components/profile/DeleteAccountSection';
import { useDeleteAccount } from '@/hooks/mutations/useUpdateProfile';

vi.mock('@/hooks/mutations/useUpdateProfile', () => ({
  useDeleteAccount: vi.fn(),
}));

const mockMutate = vi.fn();

async function openDialog() {
  const user = userEvent.setup();
  render(<DeleteAccountSection />);
  await user.click(screen.getByRole('button', { name: 'حذف حسابي' }));
  return user;
}

describe('DeleteAccountSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDeleteAccount).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never);
  });

  it('disables the confirm button until the exact confirmation word is typed', async () => {
    const user = await openDialog();
    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'حذف حسابي نهائياً' });

    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/اكتب/), 'حذ');
    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/اكتب/), 'ف');
    expect(confirmButton).toBeEnabled();
  });

  it('does not call mutate on a click while the button is disabled', async () => {
    const user = await openDialog();
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'حذف حسابي نهائياً' }));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls mutate with no arguments once the confirmation word matches exactly', async () => {
    const user = await openDialog();
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/اكتب/), 'حذف');
    await user.click(within(dialog).getByRole('button', { name: 'حذف حسابي نهائياً' }));

    expect(mockMutate).toHaveBeenCalledWith();
  });

  it('rejects a close match (extra characters) — exact match only', async () => {
    const user = await openDialog();
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/اكتب/), 'حذفx');
    expect(within(dialog).getByRole('button', { name: 'حذف حسابي نهائياً' })).toBeDisabled();
  });

  it('clears the confirmation text when the dialog is reopened', async () => {
    const user = await openDialog();
    let dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/اكتب/), 'حذف');
    await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));

    await user.click(screen.getByRole('button', { name: 'حذف حسابي' }));
    dialog = screen.getByRole('dialog');

    expect(within(dialog).getByLabelText(/اكتب/)).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'حذف حسابي نهائياً' })).toBeDisabled();
  });

  it('shows a pending label and disables confirm while deleting', async () => {
    vi.mocked(useDeleteAccount).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    } as never);
    const user = await openDialog();
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/اكتب/), 'حذف');

    expect(within(dialog).getByRole('button', { name: 'جارٍ الحذف…' })).toBeDisabled();
  });
});
