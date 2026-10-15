/**
 * GoogleAuthButton — OAuth entry (full-page navigation).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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
    expect(screen.getByRole('link', { name: /المتابعة باستخدام Google/ })).toBeInTheDocument();
  });

  it('uses a custom label when provided', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED = 'true';
    const { GoogleAuthButton } = await import('@/components/auth/GoogleAuthButton');
    render(<GoogleAuthButton label="تسجيل الدخول بـ Google" />);
    expect(screen.getByRole('link', { name: 'تسجيل الدخول بـ Google' })).toBeInTheDocument();
  });

  it('links directly to the backend OAuth endpoint for full-page navigation', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED = 'true';
    const { GoogleAuthButton } = await import('@/components/auth/GoogleAuthButton');
    render(<GoogleAuthButton />);
    const link = screen.getByRole('link', { name: /Google/ });
    expect(link.getAttribute('href')).toMatch(/\/auth\/google$/);
  });
});
