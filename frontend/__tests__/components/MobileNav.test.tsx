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
import { setupUser } from '@/test-support/user-event';
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

    it('shows account links: dashboard, my ads, favorites', () => {
      render(<MobileNav />);
      expect(screen.getByRole('link', { name: 'لوحة التحكم' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'إعلاناتي' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'المفضلة' })).toBeInTheDocument();
    });

    // FIX UX-SETTINGS-01: "الإعدادات" used to be a flat link straight to
    // /settings/profile — same gap ProtectedMobileNav.test.tsx's own
    // "renders الإعدادات as a disclosure group" test pins down for the
    // protected-header drawer. This mirrors that here for the
    // public-header drawer, since a logged-in user can open this exact
    // drawer from any public page (/, /stores, etc).
    it('renders "الإعدادات" as a disclosure group, not a flat link', () => {
      render(<MobileNav />);
      expect(screen.queryByRole('link', { name: 'الإعدادات' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /الإعدادات/ })).toBeInTheDocument();
    });

    it('expands the settings disclosure group to reveal its destinations on click', async () => {
      const user = setupUser();
      render(<MobileNav />);

      expect(screen.queryByRole('link', { name: 'ملف البائع' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /الإعدادات/ }));

      expect(screen.getByRole('link', { name: 'الملف الشخصي' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ملف البائع' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ملف مقدم الخدمة' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'متجري' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'الأمان' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'الجلسات' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'الإشعارات' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'المستخدمون المحظورون' })).toBeInTheDocument();
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
      const user = setupUser();
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
