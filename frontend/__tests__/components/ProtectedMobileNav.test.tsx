/**
 * __tests__/components/ProtectedMobileNav.test.tsx
 *
 * Previously uncovered (0%), ~403 lines. Slide-out drawer nav for the
 * authenticated section below `lg`, structurally close to
 * ProtectedSidebar (already tested) but with its own open/close wiring
 * (useUIStore), body-scroll-lock, Escape-to-close, and role-gated
 * disclosure groups (services/store) vs CTA rows.
 *
 * Coverage targets:
 *  - toggle button opens/closes the drawer (useUIStore wiring)
 *  - backdrop click and Escape key both close it
 *  - body scroll gets locked while open and restored on close
 *  - "خدماتي"/"متجري": disclosure group when the role exists, CTA link
 *    when it doesn't (gated on isSuccess && data, same as ProtectedSidebar)
 *  - disclosure groups expand by default when pathname is inside them
 *  - active link gets aria-current="page"
 *  - admin-tier link visibility + active state
 *  - logout button calls logout + close
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ProtectedMobileNav } from '@/components/layout/ProtectedMobileNav';
import { useMySellerProfile, useIsSeller } from '@/hooks/queries/useSellers';
import { useMyServiceProvider, useIsProvider } from '@/hooks/queries/useServiceProviders';
import { useMyStore } from '@/hooks/queries/useStores';

const mockUsePathname = vi.fn(() => '/dashboard');
const mockToggle = vi.fn();
const mockClose = vi.fn();
const mockLogout = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let isMobileNavOpen = false;
let mockSearchParams = new URLSearchParams();

vi.mock('@/store/ui.store', () => ({
  useUIStore: (selector: (s: unknown) => unknown) =>
    selector({
      isMobileNavOpen,
      toggleMobileNav: mockToggle,
      closeMobileNav: mockClose,
    }),
  selectIsMobileNavOpen: (s: { isMobileNavOpen: boolean }) => s.isMobileNavOpen,
}));

let isAdmin = false;

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { isAdmin: boolean; user: { id: string; name: string; role: string } | null }) => unknown) =>
    selector({ isAdmin, user: { id: 'user-1', name: 'مستخدم', role: isAdmin ? 'ADMIN' : 'USER' } }),
  selectIsAdminTier: (s: { isAdmin: boolean }) => s.isAdmin,
  selectUser: (s: { user: unknown }) => s.user,
  selectHasAccessToken: (s: any) => Boolean(s?.accessToken ?? s?.hasAccessToken),
  selectHydratedUser: (s: any) => (s?.isHydrated ? s.user : null),
  selectHydratedIsAuthenticated: (s: any) => (s?.isHydrated ? Boolean(s?.isAuthenticated ?? s?.user) : false),
  selectIsAuthResolving: (s: any) => Boolean(s?.isAuthResolving),
  selectIsHydrated: (s: any) => Boolean(s?.isHydrated),
  selectAccessToken: (s: any) => s?.accessToken,
  selectIsAuthenticated: (s: any) => Boolean(s?.isAuthenticated ?? s?.user),
}));

vi.mock('@/hooks/useNavigationUsage', () => ({
  useNavigationUsage: () => ({ recordNavigation: vi.fn(), isUsed: () => true }),
}));

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useLogout: () => ({ mutate: mockLogout, isPending: false }),
}));

vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(),
  useIsSeller: vi.fn(() => ({ isSeller: true, isLoaded: true })),
}));

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProvider: vi.fn(),
  useIsProvider: vi.fn(() => ({ isProvider: true, isLoaded: true })),
}));

vi.mock('@/hooks/queries/useStores', () => ({
  useMyStore: vi.fn(),
}));

async function renderNav() {
  const result = render(<ProtectedMobileNav />);
  await waitFor(() => expect(document.getElementById('protected-mobile-nav-drawer')).not.toBeNull());
  return result;
}

describe('ProtectedMobileNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileNavOpen = false;
    isAdmin = false;
    mockUsePathname.mockReturnValue('/dashboard');
    document.body.style.overflow = '';
    (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { id: 'seller-1' },
      isSuccess: true,
    });
    (useIsSeller as ReturnType<typeof vi.fn>).mockReturnValue({ isSeller: true, isLoaded: true });
    (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { id: 'provider-1' },
      isSuccess: true,
    });
    (useIsProvider as ReturnType<typeof vi.fn>).mockReturnValue({ isProvider: true, isLoaded: true });
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { id: 'store-1', status: 'ACTIVE' },
      isSuccess: true,
    });
  });

  it('renders a closed drawer by default with inert (not aria-hidden)', async () => {
    isMobileNavOpen = false;
    await renderNav();
    // SW-FIX-DRAWER-INERT: closed drawer uses `inert` instead of aria-hidden.
    const nav = document.body.querySelector('nav[aria-label="القائمة الشخصية"]');
    expect(nav).not.toBeNull();
    expect(nav?.hasAttribute('inert')).toBe(true);
  });

  it('toggle button calls toggleMobileNav on click', async () => {
    await renderNav();
    fireEvent.click(screen.getByLabelText('افتح القائمة'));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('shows a backdrop when open, and clicking it closes the drawer', async () => {
    isMobileNavOpen = true;
    await renderNav();
    // Portaled to document.body (see above); the actual backdrop class
    // is z-[90], not z-40.
    const backdrop = document.body.querySelector('.fixed.inset-0.z-\\[90\\]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('does not render a backdrop when closed', async () => {
    isMobileNavOpen = false;
    await renderNav();
    expect(document.body.querySelector('.fixed.inset-0.z-\\[90\\]')).toBeNull();
  });

  it('pressing Escape closes the drawer while open', async () => {
    isMobileNavOpen = true;
    await renderNav();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('does not respond to Escape while closed', async () => {
    isMobileNavOpen = false;
    await renderNav();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('locks body scroll while open and restores it when closed', async () => {
    isMobileNavOpen = true;
    const { unmount } = await renderNav();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('renders the browse links section', async () => {
    await renderNav();
    expect(screen.getByText('الرئيسية').closest('a')?.getAttribute('href')).toBe('/');
    expect(screen.getByText('البحث').closest('a')).not.toBeNull();
    expect(screen.getByText('المتاجر').closest('a')).not.toBeNull();
    expect(screen.getByText('الخدمات').closest('a')).not.toBeNull();
    expect(screen.getByText('مقدمو الخدمة').closest('a')).not.toBeNull();
  });

  it('renders the core account links', async () => {
    isMobileNavOpen = true;
    await renderNav();
    expect(screen.getByText('لوحة التحكم')).toBeInTheDocument();
    expect(screen.getByText('إعلاناتي')).toBeInTheDocument();
    expect(screen.getByText('الرسائل')).toBeInTheDocument();
    // Secondary destinations live under ACTIVITY_GROUP disclosure
    fireEvent.click(screen.getByRole('button', { name: /نشاطي/ }));
    expect(screen.getByText('المفضلة')).toBeInTheDocument();
    expect(screen.getByText('عمليات البحث المحفوظة')).toBeInTheDocument();
    expect(screen.getByText('بلاغاتي')).toBeInTheDocument();
    expect(screen.getByText('الإعدادات')).toBeInTheDocument();
  });

  it('sets aria-current="page" on the active link', async () => {
    isMobileNavOpen = true;
    mockUsePathname.mockReturnValue('/my-ads');
    await renderNav();
    expect(screen.getByText('إعلاناتي').closest('a')?.getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: /نشاطي/ }));
    expect(screen.getByText('المفضلة').closest('a')?.getAttribute('aria-current')).toBeNull();
  });

  it('renders "الإعدادات" as a disclosure group (FIX UX-16: was a flat link, now matches ProtectedSidebar\'s 8-destination group)', async () => {
    // FIX (test bug, not a component bug): getByRole excludes
    // aria-hidden elements from the accessibility tree by design (see
    // this file's own first test's comment) — the drawer's <nav> is
    // aria-hidden="true" while isMobileNavOpen is false (the default),
    // so getByRole('button', ...) could never find the settings
    // toggle regardless of whether the component renders it correctly.
    // Every other test here that needs an accessible-role query on
    // drawer content sets isMobileNavOpen = true first (see 'shows a
    // backdrop when open' etc.) — this test just needed the same.
    isMobileNavOpen = true;
    await renderNav();
    expect(screen.getByRole('button', { name: /الإعدادات/ })).toBeInTheDocument();
  });

  it('settings group opens automatically and shows its sub-destinations when already on a /settings/* subpath (seller: 7, "متجري" excluded — see below)', async () => {
    // Same fix as the test above — must open the drawer before
    // getByRole can see anything inside it.
    isMobileNavOpen = true;
    mockUsePathname.mockReturnValue('/settings');
    mockSearchParams = new URLSearchParams('tab=security');
    await renderNav();
    const toggle = screen.getByRole('button', { name: /الإعدادات/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('الملف الشخصي').closest('a')?.getAttribute('href')).toBe('/settings');
    expect(screen.getByText('الأمان').closest('a')?.getAttribute('href')).toBe('/settings?tab=security');
    expect(screen.getByText('الجلسات').closest('a')?.getAttribute('href')).toBe('/settings?tab=sessions');
    expect(screen.getByText('الإشعارات').closest('a')?.getAttribute('href')).toBe('/settings?tab=notifications');
    expect(screen.getByText('المستخدمون المحظورون').closest('a')?.getAttribute('href')).toBe('/settings?tab=blocked-users');
    expect(screen.getByText('الأمان').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  // AUDIT-FIX (nav duplication): default mock here is a seller, so the
  // "متجري" STORE_GROUP disclosure also renders in this same drawer
  // (further down, see the "متجري" describe block below). Settings'
  // own "متجري" child must be dropped in that case — otherwise the
  // exact same /my-store destination appears twice in one drawer.
  it('excludes "متجري" from "الإعدادات" once the user is a seller (STORE_GROUP already covers it)', async () => {
    isMobileNavOpen = true;
    // On a /settings/* path the group auto-expands — do NOT click the
    // toggle (that would collapse it and hide the sub-links).
    mockUsePathname.mockReturnValue('/settings');
    mockSearchParams = new URLSearchParams('tab=security');
    (useIsSeller as ReturnType<typeof vi.fn>).mockReturnValue({ isSeller: true, isLoaded: true });
    await renderNav();
    const settingsLinks = ['الملف الشخصي', 'ملف البائع', 'ملف مقدم الخدمة', 'الأمان', 'الجلسات', 'الإشعارات', 'المستخدمون المحظورون'];
    settingsLinks.forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
    // STORE_GROUP is collapsed on /settings/* so only its toggle label
    // says "متجري" (1). Expanding it reveals the child link (also
    // "متجري") → 2 total. Settings must NOT contribute a third.
    expect(screen.getAllByText('متجري')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^متجري/ }));
    // STORE_GROUP toggle still "متجري"; its own first child is "لوحة
    // المتجر" (settingsGroupFor drops "الإعدادات" → "إدارة المتجر"
    // entirely for a seller, rather than renaming anything — see
    // lib/navigation.ts).
    expect(screen.getAllByText('متجري')).toHaveLength(1);
    expect(screen.getByText('لوحة المتجر')).toBeInTheDocument();
    expect(screen.queryByText('إدارة المتجر')).not.toBeInTheDocument();
  });

  // A user with no SellerProfile yet has no STORE_GROUP at all, so
  // "الإعدادات" → "متجري" is their only path to /my-store's
  // become-a-store-owner CTA — must stay present for them.
  it('keeps "إدارة المتجر" inside "الإعدادات" for a non-seller (their only path to /my-store)', async () => {
    (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isSuccess: true });
    isMobileNavOpen = true;
    mockUsePathname.mockReturnValue('/dashboard');
    (useIsSeller as ReturnType<typeof vi.fn>).mockReturnValue({ isSeller: false, isLoaded: true });
    await renderNav();
    expect(screen.getByText('أنشئ حساب بائع').closest('a')?.getAttribute('href')).toBe('/settings?tab=profile&section=seller');
    fireEvent.click(screen.getByRole('button', { name: /الإعدادات/ }));
    expect(screen.queryByText('إدارة المتجر')).not.toBeInTheDocument();
  });

  // AUDIT-FIX (dynamic sidebar): "خدماتي"/"متجري" are fully absent for
  // non-provider/non-seller users, no CTA fallback ("أصبح مقدّم
  // خدمة"/"أصبح بائعاً"/"افتح متجرك" rows removed). /settings/seller and
  // /settings/service-provider are unchanged and still reachable
  // through the settings disclosure group.
  describe('dynamic role sections', () => {
    it('renders "خدماتي" as a disclosure group when the user is a service provider', async () => {
      isMobileNavOpen = true;
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { id: 'provider-1' }, isSuccess: true,
      });
      await renderNav();
      expect(screen.getByRole('button', { name: /خدماتي/ })).toBeInTheDocument();
    });

    it('hides "خدماتي" entirely when the user has no service-provider profile', async () => {
      isMobileNavOpen = true;
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      (useIsProvider as ReturnType<typeof vi.fn>).mockReturnValue({ isProvider: false, isLoaded: true });
      await renderNav();
      expect(screen.queryByRole('button', { name: /خدماتي/ })).not.toBeInTheDocument();
      expect(screen.queryByText('أصبح مقدّم خدمة')).not.toBeInTheDocument();
    });

    it('treats a still-loading service-provider query the same as "not yet" (section absent)', async () => {
      isMobileNavOpen = true;
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: false,
      });
      (useIsProvider as ReturnType<typeof vi.fn>).mockReturnValue({ isProvider: false, isLoaded: false });
      await renderNav();
      expect(screen.queryByRole('button', { name: /خدماتي/ })).not.toBeInTheDocument();
    });

    it('renders "متجري" as a disclosure group when the user is a seller', async () => {
      isMobileNavOpen = true;
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { id: 'seller-1' }, isSuccess: true,
      });
      await renderNav();
      expect(screen.getByRole('button', { name: /متجري/ })).toBeInTheDocument();
    });

    it('hides "متجري" and "عرض متجري" entirely when the user has no seller profile, and shows إعلاناتي\'s CTA', async () => {
      isMobileNavOpen = true;
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      (useIsSeller as ReturnType<typeof vi.fn>).mockReturnValue({ isSeller: false, isLoaded: true });
      (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: false,
      });
      await renderNav();
      expect(screen.queryByRole('button', { name: /^متجري/ })).not.toBeInTheDocument();
      expect(screen.queryByText('افتح متجرك')).not.toBeInTheDocument();
      expect(screen.queryByText('أصبح بائعاً')).not.toBeInTheDocument();
      expect(screen.queryByText('عرض متجري')).not.toBeInTheDocument();
      expect(screen.queryByText('إعلاناتي')).not.toBeInTheDocument();
      expect(screen.getByText('أنشئ حساب بائع')).toBeInTheDocument();
    });

    it('hides both sections and shows the seller-signup CTA when the user has neither role', async () => {
      isMobileNavOpen = true;
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: false,
      });
      (useIsSeller as ReturnType<typeof vi.fn>).mockReturnValue({ isSeller: false, isLoaded: true });
      (useIsProvider as ReturnType<typeof vi.fn>).mockReturnValue({ isProvider: false, isLoaded: true });
      await renderNav();
      expect(screen.queryByRole('button', { name: /خدماتي/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^متجري/ })).not.toBeInTheDocument();
      // SELLER-GATE: إعلاناتي hidden for non-sellers, CTA shown instead.
      expect(screen.queryByText('إعلاناتي')).not.toBeInTheDocument();
      expect(screen.getByText('أنشئ حساب بائع').closest('a')?.getAttribute('href')).toBe('/settings/seller');
    });

    it('hides "عرض متجري" when the store exists but is not ACTIVE', async () => {
      isMobileNavOpen = true;
      (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { id: 'store-1', status: 'PENDING' }, isSuccess: true,
      });
      await renderNav();
      expect(screen.getByRole('button', { name: /^متجري/ })).toBeInTheDocument();
      expect(screen.queryByText('عرض متجري')).not.toBeInTheDocument();
    });

    it('shows "عرض متجري" pointing at the public store page when ACTIVE', async () => {
      isMobileNavOpen = true;
      await renderNav();
      expect(screen.getByText('عرض متجري').closest('a')?.getAttribute('href')).toBe('/stores/store-1');
    });
  });

  describe('disclosure groups', () => {
    it('"خدماتي" is collapsed by default outside the group and expands on click', async () => {
      isMobileNavOpen = true;
      await renderNav();
      const toggle = screen.getByRole('button', { name: /خدماتي/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('الطلبات الواردة').closest('a')?.getAttribute('href')).toBe(
        '/my-services?tab=requests',
      );
      expect(screen.getByText('مواعيدي').closest('a')?.getAttribute('href')).toBe(
        '/my-services?tab=appointments',
      );
      expect(screen.getByText('طلباتي لمزودين').closest('a')?.getAttribute('href')).toBe('/activity?tab=requests');
    });

    it('"خدماتي" is expanded by default when pathname is inside the group', async () => {
      isMobileNavOpen = true;
      mockUsePathname.mockReturnValue('/my-services');
      mockSearchParams = new URLSearchParams('tab=appointments');
      await renderNav();
      expect(screen.getByRole('button', { name: /خدماتي/ }).getAttribute('aria-expanded')).toBe(
        'true',
      );
    });

    it('"متجري" is collapsed by default outside the group and expands on click', async () => {
      isMobileNavOpen = true;
      await renderNav();
      const toggle = screen.getByRole('button', { name: /متجري/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(toggle);
      expect(screen.getByText('منتجاتي').closest('a')?.getAttribute('href')).toBe(
        '/my-store?tab=products',
      );
      expect(screen.getByText('المتاجر المتابَعة').closest('a')?.getAttribute('href')).toBe(
        '/my-store/followed',
      );
    });

    it('"متجري" is expanded by default when pathname is inside the group', async () => {
      isMobileNavOpen = true;
      mockUsePathname.mockReturnValue('/my-store/followed');
      await renderNav();
      expect(screen.getByRole('button', { name: /متجري/ }).getAttribute('aria-expanded')).toBe(
        'true',
      );
    });

    it('clicking a disclosure child link closes the drawer via onNavigate', async () => {
      isMobileNavOpen = true;
      await renderNav();
      fireEvent.click(screen.getByRole('button', { name: /خدماتي/ }));
      fireEvent.click(screen.getByText('طلباتي لمزودين'));
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('admin link', () => {
    it('does not render the admin link for non-admins', async () => {
      isMobileNavOpen = true;
      isAdmin = false;
      await renderNav();
      expect(screen.queryByText('لوحة الإدارة')).not.toBeInTheDocument();
    });

    it('renders the admin link for admin-tier roles and marks it active on nested admin routes', async () => {
      isMobileNavOpen = true;
      isAdmin = true;
      mockUsePathname.mockReturnValue('/admin/users');
      await renderNav();
      const link = screen.getByText('لوحة الإدارة').closest('a');
      expect(link?.getAttribute('href')).toBe('/admin');
      expect(link?.getAttribute('aria-current')).toBe('page');
    });
  });

  describe('logout', () => {
    it('calls logout and closes the drawer on click', async () => {
      isMobileNavOpen = true;
      await renderNav();
      fireEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
