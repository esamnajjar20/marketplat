/**
 * __tests__/components/ReportButton.test.tsx
 *
 * Previously uncovered directly — ReportAdButton.test.tsx exercises
 * this logic only indirectly through the ads wrapper. ReportButton is
 * the shared dialog+mutation engine behind three report flows
 * (ReportAdButton, ReportUserButton, ReportStoreButton); a regression
 * here breaks all three at once, not just ads. This file tests the
 * generic component directly with a caller-agnostic mutation prop,
 * mirroring the coverage ReportAdButton.test.tsx already has for the
 * ads-specific wrapper.
 *
 * Coverage:
 *  - Auth gate: unauthenticated click shows a toast, never opens
 *  - Submit sends { reason, notes }, trimming empty notes to undefined
 *  - Changing the reason Select changes the submitted value
 *  - Dialog closes only onSuccess, not immediately on submit click
 *  - Reopening after cancel resets reason to the default and clears notes
 *  - Pending state disables submit and shows the pending label
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportButton } from '@/components/shared/ReportButton';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockMutate = vi.fn();

function mockAuth(isAuthenticated: boolean) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated }),
  );
}

function renderButton(isPending = false) {
  return render(
    <ReportButton
      triggerLabel="الإبلاغ عن هذا المستخدم"
      dialogTitle="الإبلاغ عن المستخدم"
      mutation={{ mutate: mockMutate, isPending } as never}
    />,
  );
}

async function openDialog(isPending = false) {
  const user = userEvent.setup();
  renderButton(isPending);
  await user.click(screen.getByRole('button', { name: /الإبلاغ عن هذا المستخدم/ }));
  return user;
}

describe('ReportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(true);
  });

  describe('auth gate', () => {
    it('shows an error toast and does not open the dialog when unauthenticated', async () => {
      mockAuth(false);
      const user = userEvent.setup();
      renderButton();

      await user.click(screen.getByRole('button', { name: /الإبلاغ عن هذا المستخدم/ }));

      expect(toast.error).toHaveBeenCalledWith('يرجى تسجيل الدخول أولاً');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens the dialog when authenticated', async () => {
      await openDialog();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('الإبلاغ عن المستخدم')).toBeInTheDocument();
    });
  });

  describe('submit payload', () => {
    it('sends the default reason with notes omitted when left blank', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.click(within(dialog).getByRole('button', { name: 'إرسال البلاغ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { reason: 'SCAM', notes: undefined },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('sends a different reason once selected', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.click(within(dialog).getByLabelText('سبب الإبلاغ'));
      await user.click(await screen.findByRole('option', { name: 'محتوى وهمي أو مضلل' }));
      await user.click(within(dialog).getByRole('button', { name: 'إرسال البلاغ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { reason: 'FAKE', notes: undefined },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('trims and includes notes when provided', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.type(within(dialog).getByLabelText(/تفاصيل إضافية/), '  حساب مزيف  ');
      await user.click(within(dialog).getByRole('button', { name: 'إرسال البلاغ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { reason: 'SCAM', notes: 'حساب مزيف' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });

  describe('dialog lifecycle', () => {
    it('does not close the dialog immediately on submit — only via onSuccess', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.click(within(dialog).getByRole('button', { name: 'إرسال البلاغ' }));

      // mockMutate is a bare spy here — it never calls the onSuccess
      // callback itself, so the dialog staying open proves ReportButton
      // isn't closing on its own right after calling mutate().
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('closes on cancel', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('resets reason and clears notes when reopened after a cancelled report', async () => {
      const user = await openDialog();
      let dialog = screen.getByRole('dialog');

      await user.click(within(dialog).getByLabelText('سبب الإبلاغ'));
      await user.click(await screen.findByRole('option', { name: 'رسائل مزعجة (سبام)' }));
      await user.type(within(dialog).getByLabelText(/تفاصيل إضافية/), 'مسودة ملغاة');
      await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));

      await user.click(screen.getByRole('button', { name: /الإبلاغ عن هذا المستخدم/ }));
      dialog = screen.getByRole('dialog');

      expect(within(dialog).getByLabelText('سبب الإبلاغ')).toHaveTextContent('عملية احتيال');
      expect(within(dialog).getByLabelText(/تفاصيل إضافية/)).toHaveValue('');
    });
  });

  describe('pending state', () => {
    it('shows a pending label and disables submit while sending', async () => {
      await openDialog(true);
      const dialog = screen.getByRole('dialog');

      expect(within(dialog).getByRole('button', { name: 'جارٍ الإرسال…' })).toBeDisabled();
    });
  });
});
