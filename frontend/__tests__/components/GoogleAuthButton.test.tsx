/**
 * GoogleAuthButton — OAuth entry (full-page navigation).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';

describe('GoogleAuthButton', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED = originalEnv;
    }
  });

  it('renders nothing when Google OAuth is disabled', async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED;
    const { GoogleAuthButton } = await import('@/components/auth/GoogleAuthButton');
    const { container } = render(<GoogleAuthButton />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the default label when enabled', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED = 'true';
    const { GoogleAuthButton } = await import('@/components/auth/GoogleAuthButton');
    render(<GoogleAuthButton />);
    expect(screen.getByRole('button', { name: /المتابعة باستخدام Google/ })).toBeInTheDocument();
  });

  it('uses a custom label when provided', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED = 'true';
    const { GoogleAuthButton } = await import('@/components/auth/GoogleAuthButton');
    render(<GoogleAuthButton label="تسجيل الدخول بـ Google" />);
    expect(screen.getByRole('button', { name: 'تسجيل الدخول بـ Google' })).toBeInTheDocument();
  });

  it('navigates to /auth/google on click', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED = 'true';
    const { GoogleAuthButton } = await import('@/components/auth/GoogleAuthButton');
    const hrefSpy = vi.fn();
    // jsdom location.href is often non-configurable — stub via delete+assign pattern
     
    delete (window as any).location;
     
    (window as any).location = { href: '' };
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      get: () => '',
      set: (v: string) => hrefSpy(v),
    });

    const user = setupUser();
    render(<GoogleAuthButton />);
    await user.click(screen.getByRole('button', { name: /Google/ }));
    expect(hrefSpy).toHaveBeenCalledWith(expect.stringContaining('/auth/google'));
  });
});
