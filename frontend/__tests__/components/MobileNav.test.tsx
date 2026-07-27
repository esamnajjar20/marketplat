/**
 * __tests__/components/MobileNav.test.tsx
 *
 * FIX UX-12: MobileNav's link list used to be a single hardcoded
 * constant that always showed "تسجيل الدخول" / "إنشاء حساب", even to
 * an already logged-in user. This pins down that it now branches on
 * auth state like PublicHeader.tsx does, and that logout actually
 * works from the drawer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileNav } from '@/components/layout/MobileNav';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useLogout: vi.fn(),
}));

const mockLogout = vi.fn();

describe('MobileNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ isMobileNavOpen: true });
    useAuthStore.getState().logout();
    vi.mocked(useLogout).mockReturnValue({ mutate: mockLogout, isPending: false } as never);
  });

  describe('guest (not authenticated)', () => {
    it('shows login and register links', () => {
      render(<MobileNav />);
      expect(screen.getByRole('link', { name: 'تسجيل الدخول' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'إنشاء حساب' })).toBeInTheDocument();
    });

    it('does not show authenticated-only links or a logout button', () => {
      render(<MobileNav />);
      expect(screen.queryByRole('link', { name: 'لوحة التحكم' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'إعلاناتي' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /تسجيل الخروج/ })).not.toBeInTheDocument();
    });
  });

  describe('authenticated user', () => {
    beforeEach(() => {
      useAuthStore.getState().setAuth(
        { id: 'u1', name: 'أحمد', email: 'a@a.com', role: 'USER' },
        { accessToken: 'token' },
      );
    });

    it('does not show login or register links', () => {
      render(<MobileNav />);
      expect(screen.queryByRole('link', { name: 'تسجيل الدخول' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'إنشاء حساب' })).not.toBeInTheDocument();
    });

    it('shows account links: dashboard, my ads, favorites, settings', () => {
      render(<MobileNav />);
      expect(screen.getByRole('link', { name: 'لوحة التحكم' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'إعلاناتي' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'المفضلة' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'الإعدادات' })).toBeInTheDocument();
    });

    it('does not show the admin dashboard link for a regular user', () => {
      render(<MobileNav />);
      expect(screen.queryByRole('link', { name: 'لوحة الإدارة' })).not.toBeInTheDocument();
    });

    it('shows the admin dashboard link for an admin user', () => {
      useAuthStore.getState().setAuth(
        { id: 'admin-1', name: 'مدير', email: 'admin@a.com', role: 'ADMIN' },
        { accessToken: 'token' },
      );
      render(<MobileNav />);
      expect(screen.getByRole('link', { name: 'لوحة الإدارة' })).toBeInTheDocument();
    });

    it('calls logout and closes the drawer when the logout button is clicked', async () => {
      const user = userEvent.setup();
      render(<MobileNav />);

      await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

      expect(mockLogout).toHaveBeenCalled();
      expect(useUIStore.getState().isMobileNavOpen).toBe(false);
    });

    it('shows a pending label and disables the button while logging out', () => {
      vi.mocked(useLogout).mockReturnValue({ mutate: mockLogout, isPending: true } as never);
      render(<MobileNav />);

      expect(screen.getByRole('button', { name: 'جارٍ تسجيل الخروج…' })).toBeDisabled();
    });
  });
});
