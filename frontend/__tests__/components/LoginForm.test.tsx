/**
 * __tests__/components/LoginForm.test.tsx
 *
 * Coverage for components/auth/LoginForm.tsx. The redirect math itself
 * (getSafeRedirectPath, useLogin's onSuccess routing) is already pinned
 * down in lib/cookies.test.ts and useAuthMutations.test.tsx — this file
 * focuses on what's unique to the form layer:
 *   - client-side validation (empty email/password, invalid email shape)
 *   - that the form actually reads `?from=` from useSearchParams and
 *     forwards it to login() via getSafeRedirectPath (AUTH-06 — the
 *     historical bug was that this value was computed but never used)
 *   - falls back to the dashboard route when no `from` param is present
 *   - disables the submit button and shows a loading label while pending
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/auth/LoginForm';
import { useLogin } from '@/hooks/mutations/useAuthMutations';
import { ROUTES } from '@/lib/constants';

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useLogin: vi.fn(),
}));

// Local override of next/navigation — lets each test control the `from`
// search param, unlike the empty-by-default global mock in vitest.setup.ts.
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/login',
}));

const mockLogin = vi.fn();

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    (useLogin as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockLogin,
      isPending: false,
      error: null,
    });
  });

  describe('validation', () => {
    it('shows a required-field error and does not call login when email is empty', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      // Email deliberately left blank, so isFormIncomplete keeps the
      // submit button disabled — a click on it would be a no-op.
      // Enter in the password field submits the <form> the same way it
      // would for a real user (real browser behaviour), which is what
      // actually exercises validate()'s error path here.
      await user.type(screen.getByLabelText(/كلمة المرور/), 'password123{Enter}');

      expect(screen.getByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows an invalid-email error for a malformed email', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'not-an-email');
      await user.type(screen.getByLabelText(/كلمة المرور/), 'password123');
      await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

      expect(screen.getByText('بريد إلكتروني غير صالح')).toBeInTheDocument();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows a required-field error when password is empty (no min-length check — FIX V-01)', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      // Same disabled-button trap as above, mirrored for the password
      // field: it must stay empty for this scenario, so submit via
      // Enter in the email field instead of clicking the button.
      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'a@b.com{Enter}');

      expect(screen.getByText('كلمة المرور مطلوبة')).toBeInTheDocument();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('does not reject a short password client-side (server owns the strength check)', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'a@b.com');
      await user.type(screen.getByLabelText(/كلمة المرور/), 'ab');
      await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

      expect(screen.queryByText('كلمة المرور مطلوبة')).not.toBeInTheDocument();
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });
  });

  describe('redirect handling (AUTH-06 regression coverage)', () => {
    it('submits with redirectTo = the dashboard route when no ?from= param is present', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'a@b.com');
      await user.type(screen.getByLabelText(/كلمة المرور/), 'password123');
      await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

      expect(mockLogin).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'password123',
        redirectTo: ROUTES.dashboard,
      });
    });

    it('submits with redirectTo = the decoded ?from= value when present and safe', async () => {
      mockSearchParams = new URLSearchParams({ from: '/ads/create' });
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'a@b.com');
      await user.type(screen.getByLabelText(/كلمة المرور/), 'password123');
      await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

      expect(mockLogin).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'password123',
        redirectTo: '/ads/create',
      });
    });

    it('falls back to the dashboard when ?from= is an unsafe/protocol-relative URL', async () => {
      mockSearchParams = new URLSearchParams({ from: '//evil.com' });
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'a@b.com');
      await user.type(screen.getByLabelText(/كلمة المرور/), 'password123');
      await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

      expect(mockLogin).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'password123',
        redirectTo: ROUTES.dashboard,
      });
    });
  });

  describe('pending state', () => {
    it('disables the submit button and shows the loading label while isPending', () => {
      (useLogin as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockLogin,
        isPending: true,
        error: null,
      });
      render(<LoginForm />);

      const button = screen.getByRole('button', { name: 'جارٍ الدخول…' });
      expect(button).toBeDisabled();
    });
  });

  describe('navigation links', () => {
    it('renders a link to the register page', () => {
      render(<LoginForm />);
      expect(screen.getByRole('link', { name: 'إنشاء حساب' })).toHaveAttribute('href', ROUTES.register);
    });

    it('renders a link to the forgot-password page', () => {
      render(<LoginForm />);
      expect(screen.getByRole('link', { name: 'نسيت كلمة المرور؟' })).toHaveAttribute(
        'href',
        '/forgot-password',
      );
    });
  });

  // UX-FIX P0-2: client.ts's response interceptor appends
  // ?reason=session_expired when it force-redirects here after a failed
  // silent token refresh, so the user sees why they landed on the login
  // page instead of it looking like an ordinary, unexplained visit.
  describe('session-expired notice (UX-FIX P0-2)', () => {
    it('shows a session-expired banner when ?reason=session_expired is present', () => {
      mockSearchParams = new URLSearchParams({ reason: 'session_expired' });
      render(<LoginForm />);

      expect(screen.getByRole('alert')).toHaveTextContent('انتهت جلستك');
    });

    it('does not show the banner on an ordinary visit with no reason param', () => {
      render(<LoginForm />);

      expect(screen.queryByText(/انتهت جلستك/)).not.toBeInTheDocument();
    });

    it('does not show the banner for an unrelated reason value', () => {
      mockSearchParams = new URLSearchParams({ reason: 'something_else' });
      render(<LoginForm />);

      expect(screen.queryByText(/انتهت جلستك/)).not.toBeInTheDocument();
    });
  });
});
