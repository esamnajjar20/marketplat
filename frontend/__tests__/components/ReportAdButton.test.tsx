/**
 * __tests__/components/ReportAdButton.test.tsx
 *
 * FIX INTEG-07: covers the report dialog that replaced AdDetail.tsx's
 * previously inert "الإبلاغ عن هذا الإعلان" button. Real logic:
 *   - The trigger requires authentication (mirrors AdDetail's own
 *     handleFavorite auth gate) — unauthenticated clicks show a toast
 *     and never open the dialog.
 *   - Opening resets reason to the default ('SCAM') and clears notes,
 *     so a previously-cancelled report doesn't leak into the next open.
 *   - Submit sends { reason, notes } to useReportAd, trimming empty
 *     notes to undefined rather than an empty string.
 *   - Dialog closes only onSuccess, not immediately on submit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportAdButton } from '@/components/ads/ReportAdButton';
import { useReportAd } from '@/hooks/mutations/useReportMutations';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

vi.mock('@/hooks/mutations/useReportMutations', () => ({
  useReportAd: vi.fn(),
}));

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

async function openDialog() {
  const user = userEvent.setup();
  render(<ReportAdButton adId="ad-1" />);
  await user.click(screen.getByRole('button', { name: /الإبلاغ عن هذا الإعلان/ }));
  return user;
}

describe('ReportAdButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useReportAd).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never);
    mockAuth(true);
  });

  it('calls useReportAd with the ad id', () => {
    render(<ReportAdButton adId="ad-1" />);
    expect(useReportAd).toHaveBeenCalledWith('ad-1');
  });

  describe('auth gate', () => {
    it('shows an error toast and does not open the dialog when unauthenticated', async () => {
      mockAuth(false);
      const user = userEvent.setup();
      render(<ReportAdButton adId="ad-1" />);

      await user.click(screen.getByRole('button', { name: /الإبلاغ عن هذا الإعلان/ }));

      expect(toast.error).toHaveBeenCalledWith('يرجى تسجيل الدخول أولاً');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens the dialog when authenticated', async () => {
      await openDialog();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('submit payload', () => {
    it('sends the selected reason with notes omitted when left blank', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.click(within(dialog).getByRole('button', { name: 'إرسال البلاغ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { reason: 'SCAM', notes: undefined },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('sends a different reason when selected', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.selectOptions(within(dialog).getByLabelText('سبب الإبلاغ'), 'OFFENSIVE');
      await user.click(within(dialog).getByRole('button', { name: 'إرسال البلاغ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { reason: 'OFFENSIVE', notes: undefined },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('trims and includes notes when provided', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.type(within(dialog).getByLabelText(/تفاصيل إضافية/), '  رقم مزيف  ');
      await user.click(within(dialog).getByRole('button', { name: 'إرسال البلاغ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { reason: 'SCAM', notes: 'رقم مزيف' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });

  describe('reopen resets state', () => {
    it('clears notes and resets reason after a cancelled report', async () => {
      const user = await openDialog();
      let dialog = screen.getByRole('dialog');

      await user.selectOptions(within(dialog).getByLabelText('سبب الإبلاغ'), 'SPAM');
      await user.type(within(dialog).getByLabelText(/تفاصيل إضافية/), 'مسودة ملغاة');
      await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));

      await user.click(screen.getByRole('button', { name: /الإبلاغ عن هذا الإعلان/ }));
      dialog = screen.getByRole('dialog');

      expect(within(dialog).getByLabelText('سبب الإبلاغ')).toHaveValue('SCAM');
      expect(within(dialog).getByLabelText(/تفاصيل إضافية/)).toHaveValue('');
    });
  });

  describe('pending state', () => {
    it('shows a pending label and disables submit while sending', async () => {
      vi.mocked(useReportAd).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      } as never);
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      expect(within(dialog).getByRole('button', { name: 'جارٍ الإرسال…' })).toBeDisabled();
    });
  });
});
