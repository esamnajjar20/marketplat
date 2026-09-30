/**
 * __tests__/components/ProtectedSidebar.test.tsx
 *
 * REORG-04: "خدماتي" and "متجري" became disclosure-group buttons
 * (expand/collapse) instead of plain links.
 *
 * P1 FIX (layout audit §6, "sidebar داخل sidebar"): "الإعدادات" is now
 * also a disclosure group (SETTINGS_GROUP) instead of a flat link,
 * folding the 8 links that used to live in the separate SettingsSidebar
 * component directly into this sidebar. Updated below to match: queried
 * as a button, its children only render once expanded, and its own
 * child labeled "متجري" is disambiguated from the top-level "متجري"
 * disclosure-group button by scoping queries with getAllByText/roles.
 *
 * Coverage targets:
 *  - Renders top-level nav items (links + the three disclosure buttons)
 *  - Active item: aria-current="page" on the matching pathname
 *  - Inactive items: no aria-current
 *  - Icon spans have aria-hidden="true" (UX-15 FIX)
 *  - Nav has correct aria-label
 *  - Disclosure groups: closed by default unless pathname is inside them,
 *    expand on click, children link to the right hrefs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ProtectedSidebar } from '@/components/layout/ProtectedSidebar';
import { useMySellerProfile, useIsSeller } from '@/hooks/queries/useSellers';
import { useMyServiceProvider, useIsProvider } from '@/hooks/queries/useServiceProviders';
import { useMyStore } from '@/hooks/queries/useStores';

// usePathname is already mocked in vitest.setup.ts to return '/dashboard'
// We re-mock it per-test to control active state.

const mockUsePathname = vi.fn(() => '/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

// ProtectedSidebar reads isAuthenticated to gate useMySellerProfile/
// useMyServiceProvider (enabled: isAuthenticated), and then only shows
// the SERVICES_GROUP/STORE_GROUP disclosure groups once those queries
// resolve with isSuccess && data (see ROLE-SEP 3.2 in the component).
// All three are mocked directly rather than left to run for real —
// same pattern AdDetail.test.tsx uses for useCategories/auth.store.
vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean; user: { id: string; name: string; role: string } | null }) => unknown) =>
    selector({ isAuthenticated: true, user: { id: 'user-1', name: 'مستخدم', role: 'USER' } }),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  selectUser: (s: { user: unknown }) => s.user,
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

// ProtectedSidebar calls useMySellerProfile (useQuery) internally, which
// throws "No QueryClient set" without a provider in the tree — every test
// in this file needs one, same pattern as AdDetail.test.tsx's renderWithClient.
function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  // Default: user has a seller profile, a service-provider profile,
  // and an ACTIVE store, so SERVICES_GROUP/STORE_GROUP disclosure
  // groups render (AUDIT-FIX dynamic sidebar: no CTA fallback anymore —
  // sections are either fully present or fully absent).
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

describe('ProtectedSidebar', () => {
  // ── Renders top-level items ───────────────────────────────────

  it('renders all top-level navigation items', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    renderWithClient(<ProtectedSidebar />);
    expect(screen.getByText('لوحة التحكم')).toBeDefined();
    expect(screen.getByText('إعلاناتي')).toBeDefined();
    expect(screen.getByText('الرسائل')).toBeDefined();
    // ACTIVITY_GROUP disclosure holds favorites / saved / activity / reports
    expect(screen.getByRole('button', { name: /نشاطي/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /نشاطي/ }));
    expect(screen.getByText('المفضلة')).toBeDefined();
    expect(screen.getByText('عمليات البحث المحفوظة')).toBeDefined();
    expect(screen.getByText('بلاغاتي')).toBeDefined();
    // REORG-04 / P1 FIX: disclosure group roots — rendered as buttons, not links.
    expect(screen.getByRole('button', { name: /خدماتي/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /متجري/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /الإعدادات/ })).toBeDefined();
  });

  it('renders a nav landmark with aria-label', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    renderWithClient(<ProtectedSidebar />);
    expect(screen.getByRole('navigation', { name: 'القائمة الشخصية' })).toBeDefined();
  });

  // ── Active state ───────────────────────────────────────────────

  it('sets aria-current="page" on the active link (/dashboard)', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    renderWithClient(<ProtectedSidebar />);
    const activeLink = screen.getByText('لوحة التحكم').closest('a');
    expect(activeLink?.getAttribute('aria-current')).toBe('page');
  });

  it('does NOT set aria-current on inactive links when on /dashboard', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    renderWithClient(<ProtectedSidebar />);
    const inactiveLinks = ['إعلاناتي', 'الرسائل'].map(
      (label) => screen.getByText(label).closest('a'),
    );
    inactiveLinks.forEach((link) => {
      expect(link?.getAttribute('aria-current')).toBeNull();
    });
  });

  it('sets aria-current on /my-ads link when pathname is /my-ads', () => {
    mockUsePathname.mockReturnValue('/my-ads');
    renderWithClient(<ProtectedSidebar />);
    const link = screen.getByText('إعلاناتي').closest('a');
    expect(link?.getAttribute('aria-current')).toBe('page');
  });

  it('sets aria-current on /favorites when pathname is /favorites', () => {
    mockUsePathname.mockReturnValue('/favorites');
    renderWithClient(<ProtectedSidebar />);
    expect(screen.getByText('المفضلة').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  it('sets aria-current on /activity when pathname is /activity', () => {
    mockUsePathname.mockReturnValue('/activity');
    renderWithClient(<ProtectedSidebar />);
    // Child label is "سجل النشاط" under ACTIVITY_GROUP
    expect(screen.getByText('سجل النشاط').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  it('only one top-level link is active at a time', () => {
    mockUsePathname.mockReturnValue('/my-ads');
    renderWithClient(<ProtectedSidebar />);
    const links = screen.getAllByRole('link');
    const activeLinkCount = links.filter(
      (l) => l.getAttribute('aria-current') === 'page',
    ).length;
    expect(activeLinkCount).toBe(1);
  });

  // ── Icon aria-hidden (UX-15 FIX) ──────────────────────────────

  it('icon spans have aria-hidden="true"', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    const { container } = renderWithClient(<ProtectedSidebar />);
    const iconSpans = container.querySelectorAll('[aria-hidden="true"]');
    // With default mock (seller + provider + ACTIVE store, all groups
    // collapsed at /dashboard): 5 NAV_ITEMS (SELLER-GATE: إعلاناتي moved
    // out) + 1 "إعلاناتي" (isSeller) + 1 "عرض ملفي" + 1
    // TRAILING_NAV_ITEMS ("بلاغاتي") = 8 flat-link icons; 3 disclosure
    // groups (خدماتي/متجري/الإعدادات) × (1 group icon + 1 chevron) = 6;
    // + 1 "عرض متجري" icon (AUDIT-FIX dynamic sidebar) = 13 total (ACTIVITY_GROUP replaced four flat items).
    expect(iconSpans.length).toBe(13);
  });

  // ── Correct hrefs ──────────────────────────────────────────────

  it('dashboard link points to /dashboard', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    renderWithClient(<ProtectedSidebar />);
    const link = screen.getByText('لوحة التحكم').closest('a');
    expect(link?.getAttribute('href')).toBe('/dashboard');
  });

  it('my-ads link points to /my-ads', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    renderWithClient(<ProtectedSidebar />);
    const link = screen.getByText('إعلاناتي').closest('a');
    expect(link?.getAttribute('href')).toBe('/my-ads');
  });

  // ── REORG-04: disclosure groups ─────────────────────────────────

  describe('"خدماتي" disclosure group', () => {
    it('is collapsed by default when pathname is outside the group', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /خدماتي/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText('الطلبات الواردة')).not.toBeInTheDocument();
    });

    it('expands on click and reveals its children', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      fireEvent.click(screen.getByRole('button', { name: /خدماتي/ }));
      expect(screen.getByText('الطلبات الواردة').closest('a')?.getAttribute('href')).toBe('/my-services?tab=requests');
      expect(screen.getByText('مواعيدي').closest('a')?.getAttribute('href')).toBe('/my-services?tab=appointments');
      expect(screen.getByText('طلباتي').closest('a')?.getAttribute('href')).toBe('/my-requests');
    });

    it('is expanded by default when pathname is inside the group (e.g. /my-requests)', () => {
      mockUsePathname.mockReturnValue('/my-requests');
      renderWithClient(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /خدماتي/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('طلباتي')).toBeDefined();
    });
  });

  describe('"متجري" disclosure group', () => {
    it('is collapsed by default when pathname is outside the group', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /متجري/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText('المتاجر المتابَعة')).not.toBeInTheDocument();
    });

    it('expands on click and reveals its children', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      fireEvent.click(screen.getByRole('button', { name: /متجري/ }));
      expect(screen.getByText('منتجاتي').closest('a')?.getAttribute('href')).toBe('/my-store?tab=products');
      expect(screen.getByText('المتاجر المتابَعة').closest('a')?.getAttribute('href')).toBe('/my-store/followed');
    });

    it('is expanded by default when pathname is inside the group (e.g. /my-store/followed)', () => {
      mockUsePathname.mockReturnValue('/my-store/followed');
      renderWithClient(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /متجري/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });
  });

  // ── AUDIT-FIX (dynamic sidebar): "خدماتي"/"متجري" fully absent for
  // non-seller/non-provider users, no CTA fallback. Previously
  // (FIX UX-ROLES-01) an absent role showed "أصبح بائعاً"/"أصبح مقدّم
  // خدمة"/"افتح متجرك" as a top-level link instead — those rows are
  // gone. /settings/seller and /settings/service-provider are
  // unchanged and still reachable through "الإعدادات" below.

  describe('dynamic role sections', () => {
    it('shows "خدماتي" and "متجري" when the user has both roles (default mock)', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      expect(screen.getByRole('button', { name: /خدماتي/ })).toBeDefined();
      expect(screen.getByRole('button', { name: /متجري/ })).toBeDefined();
    });

    it('hides "خدماتي" entirely when the user is not a service provider', () => {
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined,
        isSuccess: true,
      });
      mockUsePathname.mockReturnValue('/dashboard');
      (useIsProvider as ReturnType<typeof vi.fn>).mockReturnValue({ isProvider: false, isLoaded: true });
      renderWithClient(<ProtectedSidebar />);
      expect(screen.queryByRole('button', { name: /خدماتي/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'أصبح مقدّم خدمة' })).not.toBeInTheDocument();
    });

    it('hides "متجري" and "عرض متجري" entirely when the user is not a seller, and shows the seller-signup CTA', () => {
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined,
        isSuccess: true,
      });
      (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined,
        isSuccess: false,
      });
      mockUsePathname.mockReturnValue('/dashboard');
      (useIsSeller as ReturnType<typeof vi.fn>).mockReturnValue({ isSeller: false, isLoaded: true });
      renderWithClient(<ProtectedSidebar />);
      // Scope to the top-level "متجري" button specifically — "متجري"
      // as text also appears as a child link inside the "الإعدادات"
      // group, so queryByRole('button') here is the correct check
      // rather than queryByText.
      expect(screen.queryByRole('button', { name: /^متجري/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'أصبح بائعاً' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'افتح متجرك' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'عرض متجري' })).not.toBeInTheDocument();
      // SELLER-GATE: إعلاناتي requires a SellerProfile server-side —
      // hidden for non-sellers, replaced by the seller-signup CTA.
      expect(screen.queryByRole('link', { name: 'إعلاناتي' })).not.toBeInTheDocument();
      const cta = screen.getByRole('link', { name: 'أنشئ حساب بائع' });
      expect(cta.getAttribute('href')).toBe('/settings/seller');
    });

    it('hides both sections and إعلاناتي, shows CTA, when the user has neither role', () => {
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined,
        isSuccess: true,
      });
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined,
        isSuccess: true,
      });
      (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined,
        isSuccess: false,
      });
      mockUsePathname.mockReturnValue('/dashboard');
      (useIsSeller as ReturnType<typeof vi.fn>).mockReturnValue({ isSeller: false, isLoaded: true });
      (useIsProvider as ReturnType<typeof vi.fn>).mockReturnValue({ isProvider: false, isLoaded: true });
      renderWithClient(<ProtectedSidebar />);
      expect(screen.queryByRole('button', { name: /خدماتي/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^متجري/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'إعلاناتي' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'أنشئ حساب بائع' })).toBeDefined();
      // "الإعدادات" (which still contains "ملف البائع"/"ملف مقدم
      // الخدمة" as edit-flow entry points) is unaffected.
      expect(screen.getByRole('button', { name: /الإعدادات/ })).toBeDefined();
    });

    it('hides "عرض متجري" when the store exists but is not yet ACTIVE', () => {
      (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { id: 'store-1', status: 'PENDING' },
        isSuccess: true,
      });
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      // "متجري" group itself still shows (isSeller is true), only the
      // public-view link is gated on ACTIVE status.
      expect(screen.getByRole('button', { name: /^متجري/ })).toBeDefined();
      expect(screen.queryByRole('link', { name: 'عرض متجري' })).not.toBeInTheDocument();
    });

    it('shows "عرض متجري" pointing at the public store page when ACTIVE', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      const link = screen.getByRole('link', { name: 'عرض متجري' });
      expect(link.getAttribute('href')).toBe('/stores/store-1');
    });
  });

  // ── P1 FIX (layout audit §6): "الإعدادات" disclosure group ──────
  // Replaces the old flat-link settings tests; SettingsSidebar (the
  // second nav column previously rendered by app/(protected)/settings/
  // layout.tsx) is gone — these 8 destinations now live here instead.

  describe('"الإعدادات" disclosure group', () => {
    it('is collapsed by default when pathname is outside the group', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /الإعدادات/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText('الأمان')).not.toBeInTheDocument();
    });

    it('expands on click and reveals its children with correct hrefs (seller: "متجري" excluded here, see below)', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      fireEvent.click(screen.getByRole('button', { name: /الإعدادات/ }));
      expect(screen.getByText('الملف الشخصي').closest('a')?.getAttribute('href')).toBe('/settings/profile');
      expect(screen.getByText('ملف البائع').closest('a')?.getAttribute('href')).toBe('/settings/seller');
      expect(screen.getByText('ملف مقدم الخدمة').closest('a')?.getAttribute('href')).toBe('/settings/service-provider');
      expect(screen.getByText('الأمان').closest('a')?.getAttribute('href')).toBe('/settings/security');
      expect(screen.getByText('الجلسات').closest('a')?.getAttribute('href')).toBe('/settings/sessions');
      expect(screen.getByText('الإشعارات').closest('a')?.getAttribute('href')).toBe('/settings/notifications');
      expect(screen.getByText('المستخدمون المحظورون').closest('a')?.getAttribute('href')).toBe('/settings/blocked-users');
    });

    // AUDIT-FIX (nav duplication): this file's default beforeEach mocks
    // a seller (useMySellerProfile succeeds), so STORE_GROUP renders as
    // its own "متجري" disclosure. settingsGroupFor(isSeller) must drop
    // the redundant "متجري" child from "الإعدادات" in that case — only
    // the STORE_GROUP toggle + its own child link should say "متجري".
    it('excludes "متجري" from "الإعدادات" once the user is a seller (STORE_GROUP already covers it)', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      renderWithClient(<ProtectedSidebar />);
      fireEvent.click(screen.getByRole('button', { name: /الإعدادات/ }));
      fireEvent.click(screen.getByRole('button', { name: /^متجري/ }));

      // STORE_GROUP toggle still labeled "متجري"; its first child is
      // "لوحة المتجر" (STORE_GROUP's own dashboard link — settingsGroupFor
      // drops "الإعدادات" → "إدارة المتجر" entirely rather than renaming
      // anything, per lib/navigation.ts). Settings must not add another
      // store link.
      expect(screen.getAllByText('متجري')).toHaveLength(1);
      expect(screen.getByText('لوحة المتجر')).toBeInTheDocument();
      expect(screen.queryByText('إدارة المتجر')).not.toBeInTheDocument();
    });

    // A user with no SellerProfile yet has no STORE_GROUP at all (it's
    // gated on isSeller), so "الإعدادات" → "متجري" is their only path
    // to /my-store's become-a-store-owner CTA — must stay present.
    it('keeps "متجري" inside "الإعدادات" for a non-seller (their only path to /my-store)', () => {
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, isSuccess: false });
      mockUsePathname.mockReturnValue('/dashboard');
      (useIsSeller as ReturnType<typeof vi.fn>).mockReturnValue({ isSeller: false, isLoaded: true });
      renderWithClient(<ProtectedSidebar />);

      // No STORE_GROUP toggle for a non-seller.
      expect(screen.queryByRole('button', { name: /^متجري/ })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /الإعدادات/ }));
      expect(screen.getByText('إدارة المتجر').closest('a')?.getAttribute('href')).toBe('/my-store');
    });

    it('is expanded by default when pathname is inside the group (e.g. /settings/security)', () => {
      mockUsePathname.mockReturnValue('/settings/security');
      renderWithClient(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /الإعدادات/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('الأمان').closest('a')?.getAttribute('aria-current')).toBe('page');
    });

    it('is expanded by default when pathname is /settings/profile', () => {
      mockUsePathname.mockReturnValue('/settings/profile');
      renderWithClient(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /الإعدادات/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });
  });
});
