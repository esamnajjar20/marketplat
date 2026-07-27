/**
 * __tests__/components/ApiError.test.tsx
 *
 * Coverage for components/shared/ApiError.tsx and the two components it
 * dispatches to (Unauthorized, Forbidden). This is a high-value target:
 * the dispatch logic (401 → Unauthorized, 403 → Forbidden, 404/500+ →
 * generic) is exactly the kind of branching that breaks silently if a
 * future refactor changes the error shape (statusCode vs status) and
 * nothing currently catches it.
 *
 * Unauthorized in particular builds the `?from=<pathname>` login link —
 * the same redirect mechanism fixed in AUTH-06/LoginForm. This pins
 * that link-building behavior down independently of the form itself.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/components/shared/ApiError';
import { Forbidden } from '@/components/shared/Forbidden';
import { Unauthorized } from '@/components/shared/Unauthorized';

describe('ApiError — status code dispatch', () => {
  it('renders Unauthorized for a 401 statusCode error', () => {
    render(<ApiError error={{ statusCode: 401, message: 'No token' }} />);
    expect(screen.getByText('يلزم تسجيل الدخول')).toBeInTheDocument();
  });

  it('renders Unauthorized for a 401 `status` (axios-style) error', () => {
    render(<ApiError error={{ status: 401, message: 'No token' }} />);
    expect(screen.getByText('يلزم تسجيل الدخول')).toBeInTheDocument();
  });

  it('renders Forbidden for a 403 statusCode error', () => {
    render(<ApiError error={{ statusCode: 403, message: 'No permission' }} />);
    expect(screen.getByText('غير مصرَّح بالوصول')).toBeInTheDocument();
  });

  it('renders a "Not found" message for a 404 error, with the backend message', () => {
    render(<ApiError error={{ statusCode: 404, message: 'الإعلان غير موجود' }} />);
    expect(screen.getByText('غير موجود')).toBeInTheDocument();
    expect(screen.getByText('الإعلان غير موجود')).toBeInTheDocument();
  });

  it('renders a "Server error" message and reassurance copy for 500+', () => {
    render(<ApiError error={{ statusCode: 500, message: 'Internal error' }} />);
    expect(screen.getByText('خطأ في الخادم')).toBeInTheDocument();
    expect(screen.getByText(/تم إبلاغ فريقنا/)).toBeInTheDocument();
  });

  it('defaults to 500 (generic server error) when the error has no recognizable status field', () => {
    render(<ApiError error={new Error('something weird')} />);
    expect(screen.getByText('خطأ في الخادم')).toBeInTheDocument();
  });

  it('falls back to a generic message when the error has no message field', () => {
    render(<ApiError error={{ statusCode: 400 }} />);
    expect(screen.getByText('حدث خطأ غير متوقع.')).toBeInTheDocument();
  });

  it('shows a "Try again" button only when onRetry is provided, and calls it on click', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ApiError error={{ statusCode: 400, message: 'oops' }} onRetry={onRetry} />);

    const button = screen.getByRole('button', { name: 'إعادة المحاولة' });
    await user.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render a "Try again" button when onRetry is omitted', () => {
    render(<ApiError error={{ statusCode: 400, message: 'oops' }} />);
    expect(screen.queryByRole('button', { name: 'إعادة المحاولة' })).not.toBeInTheDocument();
  });
});

describe('Forbidden', () => {
  it('renders default title and description', () => {
    render(<Forbidden />);
    expect(screen.getByText('غير مصرَّح بالوصول')).toBeInTheDocument();
    expect(screen.getByText('لا تملك صلاحية عرض هذه الصفحة.')).toBeInTheDocument();
  });

  it('renders custom title/description when provided', () => {
    render(<Forbidden title="ممنوع الدخول" description="هذا القسم للمشرفين فقط" />);
    expect(screen.getByText('ممنوع الدخول')).toBeInTheDocument();
    expect(screen.getByText('هذا القسم للمشرفين فقط')).toBeInTheDocument();
  });

  it('shows a "Go to Dashboard" link by default (showBack=false)', () => {
    render(<Forbidden />);
    expect(screen.getByRole('link', { name: 'الذهاب إلى لوحة التحكم' })).toHaveAttribute('href', '/dashboard');
  });

  it('shows a "Go back" button instead when showBack is true', () => {
    render(<Forbidden showBack />);
    expect(screen.getByRole('button', { name: 'رجوع' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'الذهاب إلى لوحة التحكم' })).not.toBeInTheDocument();
  });

  it('always shows a Home link', () => {
    render(<Forbidden />);
    expect(screen.getByRole('link', { name: 'الرئيسية' })).toHaveAttribute('href', '/');
  });
});

describe('Unauthorized', () => {
  it('renders default title and description', () => {
    render(<Unauthorized />);
    expect(screen.getByText('يلزم تسجيل الدخول')).toBeInTheDocument();
  });

  it('renders custom title/description when provided', () => {
    render(<Unauthorized title="انتهت الجلسة" description="يرجى تسجيل الدخول مجدداً" />);
    expect(screen.getByText('انتهت الجلسة')).toBeInTheDocument();
  });

  it('builds the sign-in link with ?from=<current pathname> (AUTH-06 redirect contract)', () => {
    // vitest.setup.ts mocks usePathname() to always return '/dashboard'.
    render(<Unauthorized />);
    const signInLink = screen.getByRole('link', { name: 'تسجيل الدخول' });
    expect(signInLink).toHaveAttribute('href', `/login?from=${encodeURIComponent('/dashboard')}`);
  });

  it('shows a "Create account" link pointing at /register', () => {
    render(<Unauthorized />);
    expect(screen.getByRole('link', { name: 'إنشاء حساب' })).toHaveAttribute('href', '/register');
  });
});
