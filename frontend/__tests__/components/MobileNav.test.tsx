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
import { render, screen, act } from '@testing-library/react';

async function renderNav() {
  const result = await renderNav();
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}
import { setupUser } from '@/test-support/user-event';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { useMySellerProfile, useIsSeller } from '@/hooks/queries/useSellers';

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useLogout: vi.fn(),
}));

// MobileNav also drives إعلاناتي/أضف إعلانك via useMySellerProfile()
// (SELLER-GATE) — no MSW handler exists for this endpoint in this
// suite, so mock the hook directly rather than let the query hang/
// error unpredictably. Default: has a seller profile, matching this
// file's existing "authenticated user has full access" assumption;
// individual tests override for the no-profile case.
vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(() => ({ data: { id: 'seller-1' }, isSuccess: true })),
  useIsSeller: vi.fn(() => ({ isSeller: true, isLoaded: true })),
}));

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProvider: vi.fn(() => ({ data: undefined, isSuccess: false })),
  useIsProvider: vi.fn(() => ({ isProvider: false, isLoaded: true })),
}));

const mockLogout = vi.fn();

describe('MobileNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Drawer content is deferred via requestIdleCallback / 1200ms timeout.
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb();
      return 0;
    });
    vi.stubGlobal('cancelIdleCallback', () => undefined);
    useUIStore.setState({ isMobileNavOpen: true });
    useAuthStore.getState().logout();
    vi.mocked(useLogout).mockReturnValue({ mutate: mockLogout, isPending: false } as never);
    vi.mocked(useMySellerProfile).mockReturnValue({ data: { id: 'seller-1' }, isSuccess: true } as never);
    vi.mocked(useIsSeller).mockReturnValue({ isSeller: true, isLoaded: true } as never);
  });

  describe('guest (not authenticated)', () => {
    it('shows login and register links', async () => {
      await renderNav();
      expect(screen.getByRole('link', { name: 'تسجيل الدخول' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'إنشاء حساب' })).toBeInTheDocument();
    });

    it('does not show authenticated-only links or a logout button', async () => {
      await renderNav();
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

    it('does not show login or register links', async () => {
      await renderNav();
      expect(screen.queryByRole('link', { name: 'تسجيل الدخول' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'إنشاء حساب' })).not.toBeInTheDocument();
    });

    it('shows account links: dashboard, my ads, favorites', async () => {
      await renderNav();
      expect(screen.getByRole('link', { name: 'لوحة التحكم' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'إعلاناتي' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'المفضلة' })).toBeInTheDocument();
    });

    it('hides إعلاناتي/أضف إعلانك and shows the seller-signup CTA when the user has no SellerProfile', async () => {
      vi.mocked(useMySellerProfile).mockReturnValue({ data: undefined, isSuccess: true } as never);
      vi.mocked(useIsSeller).mockReturnValue({ isSeller: false, isLoaded: true } as never);
      await renderNav();
      expect(screen.queryByRole('link', { name: 'إعلاناتي' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'أضف إعلانك' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'أنشئ حساب بائع' })).toHaveAttribute('href', '/settings/seller');
    });

    // FIX UX-SETTINGS-01: "الإعدادات" used to be a flat link straight to
    // /settings/profile — same gap ProtectedMobileNav.test.tsx's own
    // "renders الإعدادات as a disclosure group" test pins down for the
    // protected-header drawer. This mirrors that here for the
    // public-header drawer, since a logged-in user can open this exact
    // drawer from any public page (/, /stores, etc).
    it('renders "الإعدادات" as a disclosure group, not a flat link', async () => {
      await renderNav();
      expect(screen.queryByRole('link', { name: 'الإعدادات' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /الإعدادات/ })).toBeInTheDocument();
    });

    it('expands the settings disclosure group to reveal its destinations on click', async () => {
      const user = setupUser();
      await renderNav();

      expect(screen.queryByRole('link', { name: 'ملف البائع' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /الإعدادات/ }));

      expect(screen.getByRole('link', { name: 'الملف الشخصي' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ملف البائع' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ملف مقدم الخدمة' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'الأمان' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'الجلسات' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'الإشعارات' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'المستخدمون المحظورون' })).toBeInTheDocument();
    });

    // AUDIT-FIX (nav duplication): this file's default mock is a seller
    // (useMySellerProfile succeeds), so the "متجري" STORE_GROUP disclosure
    // renders elsewhere in this same drawer. settingsGroupFor(isSeller)
    // drops "الإعدادات"'s own "متجري" child in that case — it would
    // otherwise be the exact same /my-store link showing up twice in one
    // drawer.
    it('excludes "متجري" from "الإعدادات" once the user is a seller (STORE_GROUP already covers it)', async () => {
      const user = setupUser();
      await renderNav();
      await user.click(screen.getByRole('button', { name: /الإعدادات/ }));
      expect(screen.queryByRole('link', { name: 'إدارة المتجر' })).not.toBeInTheDocument();
    });

    it('does not expose seller-only store management inside settings for a non-seller', async () => {
      vi.mocked(useMySellerProfile).mockReturnValue({ data: undefined, isSuccess: true } as never);
      vi.mocked(useIsSeller).mockReturnValue({ isSeller: false, isLoaded: true } as never);
      const user = setupUser();
      await renderNav();
      await user.click(screen.getByRole('button', { name: /الإعدادات/ }));
      expect(screen.queryByRole('link', { name: 'إدارة المتجر' })).not.toBeInTheDocument();
    });

    it('does not show the admin dashboard link for a regular user', async () => {
      await renderNav();
      expect(screen.queryByRole('link', { name: 'لوحة الإدارة' })).not.toBeInTheDocument();
    });

    it('shows the admin dashboard link for an admin user', async () => {
      useAuthStore.getState().setAuth(
        { id: 'admin-1', name: 'مدير', email: 'admin@a.com', role: 'ADMIN' },
        { accessToken: 'token' },
      );
      await renderNav();
      expect(screen.getByRole('link', { name: 'لوحة الإدارة' })).toBeInTheDocument();
    });

    it('calls logout and closes the drawer when the logout button is clicked', async () => {
      const user = setupUser();
      await renderNav();

      await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

      expect(mockLogout).toHaveBeenCalled();
      expect(useUIStore.getState().isMobileNavOpen).toBe(false);
    });

    it('shows a pending label and disables the button while logging out', async () => {
      vi.mocked(useLogout).mockReturnValue({ mutate: mockLogout, isPending: true } as never);
      await renderNav();

      expect(screen.getByRole('button', { name: 'جارٍ تسجيل الخروج…' })).toBeDisabled();
    });
  });
});