/**
 * __tests__/components/ForgotPasswordForm.test.tsx
 *
 * Coverage for components/auth/ForgotPasswordForm.tsx. Unlike the other
 * auth forms, this one calls authApi.forgotPassword directly (not
 * through a useMutation hook), so the local loading/error/sent state
 * machine is entirely hand-rolled — worth pinning down on its own.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { authApi } from '@/api/auth.api';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';

vi.mock('@/api/auth.api', () => ({
  authApi: { forgotPassword: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  cleanup();
});

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('shows a required error and does not call the API when email is empty', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      await user.click(screen.getByRole('button', { name: 'إرسال رابط الاسترداد' }));

      expect(screen.getByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();
      expect(authApi.forgotPassword).not.toHaveBeenCalled();
    });

    it('shows an invalid-email error for a malformed email', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'nope');
      await user.click(screen.getByRole('button', { name: 'إرسال رابط الاسترداد' }));

      expect(screen.getByText('بريد إلكتروني غير صالح')).toBeInTheDocument();
      expect(authApi.forgotPassword).not.toHaveBeenCalled();
    });
  });

  describe('submission', () => {
    it('calls authApi.forgotPassword with the trimmed email and shows the confirmation screen', async () => {
      (authApi.forgotPassword as ReturnType<typeof vi.fn>).mockResolvedValue({});
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), '  ahmad@example.com  ');
      await user.click(screen.getByRole('button', { name: 'إرسال رابط الاسترداد' }));

      await waitFor(() => {
        expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: 'ahmad@example.com' });
      });
      expect(await screen.findByText('تحقق من بريدك الإلكتروني')).toBeInTheDocument();
    });

    it('shows the submitted email address in the confirmation copy', async () => {
      (authApi.forgotPassword as ReturnType<typeof vi.fn>).mockResolvedValue({});
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'ahmad@example.com');
      await user.click(screen.getByRole('button', { name: 'إرسال رابط الاسترداد' }));

      expect(await screen.findByText('ahmad@example.com')).toBeInTheDocument();
    });

    it('shows a link back to login on the confirmation screen', async () => {
      (authApi.forgotPassword as ReturnType<typeof vi.fn>).mockResolvedValue({});
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'ahmad@example.com');
      await user.click(screen.getByRole('button', { name: 'إرسال رابط الاسترداد' }));

      await screen.findByText('تحقق من بريدك الإلكتروني');
      expect(screen.getByRole('link', { name: 'العودة لتسجيل الدخول' })).toHaveAttribute(
        'href',
        ROUTES.login,
      );
    });

    it('shows a toast error and stays on the form when the API call fails', async () => {
      (authApi.forgotPassword as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'ahmad@example.com');
      await user.click(screen.getByRole('button', { name: 'إرسال رابط الاسترداد' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      // Must NOT show the "check your email" success screen on failure.
      expect(screen.queryByText('تحقق من بريدك الإلكتروني')).not.toBeInTheDocument();
    });

    it('disables the submit button and shows the loading label while the request is in flight', async () => {
      let resolveRequest: () => void;
      (authApi.forgotPassword as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise<void>((resolve) => { resolveRequest = resolve; }),
      );
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'ahmad@example.com');
      await user.click(screen.getByRole('button', { name: 'إرسال رابط الاسترداد' }));

      expect(screen.getByRole('button', { name: 'جارٍ الإرسال…' })).toBeDisabled();

      resolveRequest!();
      await screen.findByText('تحقق من بريدك الإلكتروني');
    });
  });
});
