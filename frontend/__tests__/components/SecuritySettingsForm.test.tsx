/**
 * __tests__/components/SecuritySettingsForm.test.tsx
 *
 * Coverage for components/profile/SecuritySettingsForm.tsx.
 *
 * FIX SEC-07: the component no longer calls authApi.changePassword
 * directly — it now goes through useChangePassword(), which (on
 * success) clears the local session and redirects to /login, because
 * the backend blacklists the current access token as part of a
 * successful password change. That session-clearing/redirect behavior
 * itself is covered in useAuthMutations.test.tsx; this file focuses on
 * what's unique to the form: client-side validation, and correctly
 * distinguishing a 400 (shown under the "current password" field) from
 * any other failure (generic toast) via the mutation's onError callback
 * passed at call time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecuritySettingsForm } from '@/components/profile/SecuritySettingsForm';
import { useChangePassword } from '@/hooks/mutations/useAuthMutations';
import { toast } from 'sonner';

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useChangePassword: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// parseApiError is exercised on its own in errorParser tests; stub it
// here so this suite controls exactly which statusCode/message the
// component reacts to for each scenario.
vi.mock('@/lib/errorParser', () => ({
  parseApiError: vi.fn(),
}));
import { parseApiError } from '@/lib/errorParser';

afterEach(() => {
  cleanup();
});

const mockMutate = vi.fn();

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { current = 'oldpass123', next = 'newpass456', confirm = next }: Partial<Record<'current' | 'next' | 'confirm', string>> = {},
) {
  await user.type(screen.getByLabelText(/كلمة المرور الحالية/), current);
  await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), next);
  await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), confirm);
}

describe('SecuritySettingsForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (useChangePassword as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  describe('validation', () => {
    it('requires the current password', async () => {
      const user = userEvent.setup();
      render(<SecuritySettingsForm />);

      await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'newpass456');
      await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'newpass456');
      await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

      expect(screen.getByText('أدخل كلمة المرور الحالية')).toBeInTheDocument();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('requires the new password to be at least 8 characters', async () => {
      const user = userEvent.setup();
      render(<SecuritySettingsForm />);
      await fillForm(user, { next: 'short1', confirm: 'short1' });

      await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

      expect(screen.getByText('8 أحرف على الأقل')).toBeInTheDocument();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('rejects a new password identical to the current password', async () => {
      const user = userEvent.setup();
      render(<SecuritySettingsForm />);
      await fillForm(user, { current: 'samepass123', next: 'samepass123', confirm: 'samepass123' });

      await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

      expect(screen.getByText('كلمة المرور الجديدة يجب أن تختلف عن الحالية')).toBeInTheDocument();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('rejects a mismatched confirmation', async () => {
      const user = userEvent.setup();
      render(<SecuritySettingsForm />);
      await fillForm(user, { confirm: 'differentpass789' });

      await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

      expect(screen.getByText('كلمتا المرور غير متطابقتين')).toBeInTheDocument();
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('submission', () => {
    it('calls the mutation with the current and new passwords', async () => {
      const user = userEvent.setup();
      render(<SecuritySettingsForm />);
      await fillForm(user, { current: 'oldpass123', next: 'newpass456', confirm: 'newpass456' });

      await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { currentPassword: 'oldpass123', newPassword: 'newpass456' },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it('shows "incorrect current password" under the current-password field on a 400 response — not a generic toast', async () => {
      (parseApiError as ReturnType<typeof vi.fn>).mockReturnValue({
        statusCode: 400,
        message: 'Current password is incorrect',
      });
      // Simulate the mutation invoking the onError callback passed by
      // the component, the same way react-query would on failure.
      mockMutate.mockImplementation((_payload, opts?: { onError?: (err: unknown) => void }) => {
        opts?.onError?.(new Error('bad request'));
      });

      const user = userEvent.setup();
      render(<SecuritySettingsForm />);
      await fillForm(user);

      await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

      expect(await screen.findByText('كلمة المرور الحالية غير صحيحة')).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('shows a generic toast (not a field error) for a non-400 failure, e.g. 500', async () => {
      (parseApiError as ReturnType<typeof vi.fn>).mockReturnValue({
        statusCode: 500,
        message: 'حدث خطأ في الخادم',
      });
      mockMutate.mockImplementation((_payload, opts?: { onError?: (err: unknown) => void }) => {
        opts?.onError?.(new Error('server error'));
      });

      const user = userEvent.setup();
      render(<SecuritySettingsForm />);
      await fillForm(user);

      await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

      expect(toast.error).toHaveBeenCalledWith('حدث خطأ في الخادم');
      expect(screen.queryByText('كلمة المرور الحالية غير صحيحة')).not.toBeInTheDocument();
    });

    it('does not clear the form fields when the request fails (user stays on the page)', async () => {
      (parseApiError as ReturnType<typeof vi.fn>).mockReturnValue({ statusCode: 400, message: 'x' });
      mockMutate.mockImplementation((_payload, opts?: { onError?: (err: unknown) => void }) => {
        opts?.onError?.(new Error('bad request'));
      });

      const user = userEvent.setup();
      render(<SecuritySettingsForm />);
      await fillForm(user, { current: 'oldpass123', next: 'newpass456', confirm: 'newpass456' });

      await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

      await screen.findByText('كلمة المرور الحالية غير صحيحة');
      expect(screen.getByLabelText(/كلمة المرور الجديدة/)).toHaveValue('newpass456');
    });

    it('does NOT show a field error on success — useChangePassword itself handles the redirect', async () => {
      // On success there is no onError call; useChangePassword owns
      // clearing the session + redirecting (covered in
      // useAuthMutations.test.tsx), so this component has nothing
      // further to do beyond having called mutate.
      const user = userEvent.setup();
      render(<SecuritySettingsForm />);
      await fillForm(user, { current: 'oldpass123', next: 'newpass456', confirm: 'newpass456' });

      await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('كلمة المرور الحالية غير صحيحة')).not.toBeInTheDocument();
    });

    it('disables the submit button and shows the loading label while isPending', () => {
      (useChangePassword as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      });
      render(<SecuritySettingsForm />);

      expect(screen.getByRole('button', { name: 'جارٍ التغيير…' })).toBeDisabled();
    });
  });
});
