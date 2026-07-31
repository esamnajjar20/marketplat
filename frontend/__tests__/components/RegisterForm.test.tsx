/**
 * __tests__/components/RegisterForm.test.tsx
 *
 * Coverage for components/auth/RegisterForm.tsx — five validated fields
 * (name, email, password, optional phone, optional city) with several
 * conditional branches (phone/city only validated/sent when non-empty).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { useRegister } from '@/hooks/mutations/useAuthMutations';
import { ROUTES } from '@/lib/constants';

/** Mirrors the shape error.middleware.ts sends for a 400 BadRequestError. */
function makeConflictError(code: 'EMAIL_ALREADY_EXISTS' | 'PHONE_ALREADY_EXISTS', message: string): AxiosError {
  const response = {
    status: 400,
    statusText: '400',
    data: { message, code },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() } as AxiosError['config'],
  };
  return new AxiosError(
    'Request failed',
    '400',
    { headers: new AxiosHeaders() } as AxiosError['config'],
    {},
    response as AxiosError['response'],
  );
}

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useRegister: vi.fn(),
}));

const mockRegister = vi.fn();

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/الاسم الكامل/), 'أحمد محمد');
  await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'ahmad@example.com');
  await user.type(screen.getByLabelText(/كلمة المرور/), 'password123');
}

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRegister as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockRegister,
      isPending: false,
    });
  });

  describe('validation', () => {
    it('requires a name of at least 2 characters', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/الاسم الكامل/), 'ا');
      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'a@b.com');
      await user.type(screen.getByLabelText(/كلمة المرور/), 'password123');
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

      expect(screen.getByText('الاسم يجب أن يكون حرفين على الأقل')).toBeInTheDocument();
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('shows required error when name is empty', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));
      expect(screen.getByText('الاسم الكامل مطلوب')).toBeInTheDocument();
    });

    it('rejects an invalid email', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/الاسم الكامل/), 'أحمد محمد');
      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'not-an-email');
      await user.type(screen.getByLabelText(/كلمة المرور/), 'password123');
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

      expect(screen.getByText('بريد إلكتروني غير صالح')).toBeInTheDocument();
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('requires a password of at least 8 characters', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/الاسم الكامل/), 'أحمد محمد');
      await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'a@b.com');
      await user.type(screen.getByLabelText(/كلمة المرور/), 'short1');
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

      expect(screen.getByText('كلمة المرور 8 أحرف على الأقل')).toBeInTheDocument();
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('validates phone format only when a phone value is entered (field is optional)', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);
      await fillRequiredFields(user);

      await user.type(screen.getByLabelText(/رقم الهاتف/), 'abc');
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

      expect(screen.getByText('رقم هاتف غير صالح')).toBeInTheDocument();
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('submits successfully with all required fields and no optional fields filled', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);
      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

      expect(mockRegister).toHaveBeenCalledWith(
        {
          name: 'أحمد محمد',
          email: 'ahmad@example.com',
          password: 'password123',
          phone: undefined,
          city: undefined,
        },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it('trims whitespace from name and email before submitting', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/الاسم الكامل/), '  أحمد محمد  ');
      await user.type(screen.getByLabelText(/البريد الإلكتروني/), '  ahmad@example.com  ');
      await user.type(screen.getByLabelText(/كلمة المرور/), 'password123');
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'أحمد محمد', email: 'ahmad@example.com' }),
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it('includes a valid phone and selected city when both are provided', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);
      await fillRequiredFields(user);

      await user.type(screen.getByLabelText(/رقم الهاتف/), '+970591234567');
      await user.selectOptions(screen.getByLabelText(/المدينة/), 'غزة');
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+970591234567', city: 'غزة' }),
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });
  });

  // UX-FIX P-REG-2 / regression coverage: onError used to compare
  // parsed.message.includes('البريد الإلكتروني'), which could never match
  // (auth.service.ts sent an English message, and errorParser.ts's
  // status-code fallback never produced that exact Arabic substring) — so
  // the field-specific error was dead code. Now it switches on
  // parsed.code, which the backend actually attaches
  // (EMAIL_ALREADY_EXISTS / PHONE_ALREADY_EXISTS).
  describe('server-side duplicate email/phone (onError)', () => {
    it('sets the email field error when the backend returns EMAIL_ALREADY_EXISTS', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);
      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

      const [, options] = mockRegister.mock.calls[0];
      options.onError(makeConflictError('EMAIL_ALREADY_EXISTS', 'البريد الإلكتروني مستخدم بالفعل'));

      expect(await screen.findByText('البريد الإلكتروني مستخدم بالفعل')).toBeInTheDocument();
    });

    it('sets the phone field error when the backend returns PHONE_ALREADY_EXISTS', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);
      await fillRequiredFields(user);
      await user.type(screen.getByLabelText(/رقم الهاتف/), '+970591234567');
      await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

      const [, options] = mockRegister.mock.calls[0];
      options.onError(makeConflictError('PHONE_ALREADY_EXISTS', 'رقم الهاتف مستخدم بالفعل'));

      expect(await screen.findByText('رقم الهاتف مستخدم بالفعل')).toBeInTheDocument();
    });
  });

  describe('pending state', () => {
    it('disables the submit button and shows the loading label while isPending', () => {
      (useRegister as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockRegister,
        isPending: true,
      });
      render(<RegisterForm />);

      expect(screen.getByRole('button', { name: 'جارٍ التسجيل…' })).toBeDisabled();
    });
  });

  describe('navigation links', () => {
    it('renders a link back to the login page', () => {
      render(<RegisterForm />);
      expect(screen.getByRole('link', { name: 'تسجيل الدخول' })).toHaveAttribute('href', ROUTES.login);
    });
  });
});
