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

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('requires a password', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'password123');
      await user.click(screen.getByRole('button', { name: 'تعيين كلمة المرور' }));

      expect(screen.getByText('كلمة المرور مطلوبة')).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();
    });

    it('requires a password of at least 8 characters', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'short1');
      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'short1');
      await user.click(screen.getByRole('button', { name: 'تعيين كلمة المرور' }));

      expect(screen.getByText('كلمة المرور 8 أحرف على الأقل')).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();
    });

    it('requires the confirm field to be filled', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'password123');
      await user.click(screen.getByRole('button', { name: 'تعيين كلمة المرور' }));

      expect(screen.getByText('تأكيد كلمة المرور مطلوب')).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects mismatched password and confirmation — the critical safety check', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'password123');
      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'password456');
      await user.click(screen.getByRole('button', { name: 'تعيين كلمة المرور' }));

      expect(screen.getByText('كلمتا المرور غير متطابقتين')).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();
    });
  });

  describe('submission', () => {
    it('calls authApi.resetPassword with the token and new password, then redirects to login', async () => {
      (authApi.resetPassword as ReturnType<typeof vi.fn>).mockResolvedValue({});
      const user = userEvent.setup();
      render(<ResetPasswordForm token="reset-token-xyz" />);

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
      render(<ResetPasswordForm token="expired-token" />);

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
      render(<ResetPasswordForm token="tok-1" />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'newpassword123');
      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'newpassword123');
      await user.click(screen.getByRole('button', { name: 'تعيين كلمة المرور' }));

      expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
      resolveRequest!();
    });
  });
});
