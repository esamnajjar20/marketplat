/**
 * __tests__/components/ForgotPasswordForm.test.tsx
 *
 * Coverage for components/auth/ForgotPasswordForm.tsx. Despite the
 * "single field, hand-rolled state" feel, submission actually goes
 * through useForgotPassword() (a real useMutation hook wrapping
 * authApi.forgotPassword — see AUDIT-FIX auth#3 in the component),
 * so tests still need a QueryClientProvider even though the mocked
 * boundary is authApi rather than the hook itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
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

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
}

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('shows a required error and does not call the API when email is empty', async () => {
      const user = userEvent.setup();
      renderWithClient(<ForgotPasswordForm />);

      // Email deliberately stays empty, so isFormIncomplete keeps the
      // submit button disabled and a click on it would be a no-op.
      // Focusing the field and pressing Enter submits the <form> the
      // same way it would for a real user (real browser behaviour),
      // which is what actually exercises validate()'s error path here.
      await user.type(screen.getByLabelText(/البريد الإلكتروني/), '{Enter}');

      expect(screen.getByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();
      expect(authApi.forgotPassword).not.toHaveBeenCalled();
    });

    it('shows an invalid-email error for a malformed email', async () => {
      const user = userEvent.setup();
      renderWithClient(<ForgotPasswordForm />);

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
      renderWithClient(<ForgotPasswordForm />);

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
      renderWithClient(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'ahmad@example.com');
      await user.click(screen.getByRole('button', { name: 'إرسال رابط الاسترداد' }));

      expect(await screen.findByText('ahmad@example.com')).toBeInTheDocument();
    });

    it('shows a link back to login on the confirmation screen', async () => {
      (authApi.forgotPassword as ReturnType<typeof vi.fn>).mockResolvedValue({});
      const user = userEvent.setup();
      renderWithClient(<ForgotPasswordForm />);

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
      renderWithClient(<ForgotPasswordForm />);

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
      renderWithClient(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'ahmad@example.com');
      await user.click(screen.getByRole('button', { name: 'إرسال رابط الاسترداد' }));

      expect(screen.getByRole('button', { name: 'جارٍ الإرسال…' })).toBeDisabled();

      resolveRequest!();
      await screen.findByText('تحقق من بريدك الإلكتروني');
    });
  });
});
