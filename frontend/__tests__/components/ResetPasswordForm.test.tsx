/**
 * __tests__/components/ResetPasswordForm.test.tsx
 *
 * Coverage for components/auth/ResetPasswordForm.tsx. The
 * password/confirm mismatch check is the critical branch: if it broke
 * silently, a user could end up with a different password than the one
 * they believe they set.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { authApi } from '@/api/auth.api';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';

vi.mock('@/api/auth.api', () => ({
  authApi: { resetPassword: vi.fn() },
}));

afterEach(() => {
  cleanup();
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ResetPasswordForm uses useResetPassword() (react-query's useMutation),
// which throws without a surrounding QueryClientProvider — same pattern
// as useAuthMutations.test.tsx's createWrapper().
function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The submit button is deliberately disabled (see ResetPasswordForm's
  // isFormIncomplete guard) until both fields are filled and match, so a
  // plain click on it is a no-op whenever the scenario under test needs
  // one of those fields left empty or mismatched. Pressing Enter in a
  // text field submits its <form> even while the submit button itself is
  // disabled (real browser behaviour), which is what actually exercises
  // validate()'s error paths here — mirroring how a user who never
  // notices the button is greyed out would still trigger a submit.
  describe('validation', () => {
    it('requires a password', async () => {
      const user = userEvent.setup();
      renderWithClient(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'password123{Enter}');

      expect(screen.getByText('كلمة المرور مطلوبة')).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();
    });

    it('requires a password of at least 8 characters', async () => {
      const user = userEvent.setup();
      renderWithClient(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'short1');
      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'short1{Enter}');

      expect(screen.getByText('كلمة المرور 8 أحرف على الأقل')).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();
    });

    it('requires the confirm field to be filled', async () => {
      const user = userEvent.setup();
      renderWithClient(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'password123{Enter}');

      expect(screen.getByText('تأكيد كلمة المرور مطلوب')).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects mismatched password and confirmation — the critical safety check', async () => {
      const user = userEvent.setup();
      renderWithClient(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'password123');
      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'password456{Enter}');

      expect(screen.getByText('كلمتا المرور غير متطابقتين')).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();
    });
  });

  describe('submission', () => {
    it('calls authApi.resetPassword with the token and new password, then redirects to login', async () => {
      (authApi.resetPassword as ReturnType<typeof vi.fn>).mockResolvedValue({});
      const user = userEvent.setup();
      renderWithClient(<ResetPasswordForm token="reset-token-xyz" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'newpassword123');
      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'newpassword123');
      await user.click(screen.getByRole('button', { name: 'تعيين كلمة المرور' }));

      await waitFor(() => {
        expect(authApi.resetPassword).toHaveBeenCalledWith({
          token: 'reset-token-xyz',
          newPassword: 'newpassword123',
        });
      });
      expect(toast.success).toHaveBeenCalledWith('تم تغيير كلمة المرور بنجاح');
      expect(mockPush).toHaveBeenCalledWith(ROUTES.login);
    });

    it('shows a toast error and does NOT redirect when the API call fails (e.g. expired token)', async () => {
      (authApi.resetPassword as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Token expired'));
      const user = userEvent.setup();
      renderWithClient(<ResetPasswordForm token="expired-token" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'newpassword123');
      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'newpassword123');
      await user.click(screen.getByRole('button', { name: 'تعيين كلمة المرور' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('disables the submit button and shows the loading label while the request is in flight', async () => {
      let resolveRequest: () => void;
      (authApi.resetPassword as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise<void>((resolve) => { resolveRequest = resolve; }),
      );
      const user = userEvent.setup();
      renderWithClient(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'newpassword123');
      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'newpassword123');
      await user.click(screen.getByRole('button', { name: 'تعيين كلمة المرور' }));

      expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
      resolveRequest!();
    });
  });
});
