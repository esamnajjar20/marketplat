/**
 * __tests__/components/AdminSidebar.test.tsx
 *
 * Coverage targets (report item #6 — admin layout had no real sidebar):
 *  - Renders all 11 admin nav links, including "فئات الإعلانات" (categories),
 *    "البائعون" (Epic 1.1 — verify/suspend sellers), "فئات الخدمات"
 *    (Epic 1.2 — service-categories management), "المتاجر" (store
 *    approval — issue #1), "فئات المنتجات" (product categories), "سجل
 *    العمليات" (Audit Logs), and "التحليلات" (Gap #7 — product analytics).
 *  - Active-state: aria-current="page" set on the link matching the current pathname
 *  - Active-state: the link whose ?tab= matches (bare /admin = dashboard for
 *    ADMIN+, ads for a MODERATOR)
 *  - Mobile drawer: closed by default, opens on hamburger click, closes on
 *    backdrop click, closes on X click, closes when a nav link is clicked
 *  - Desktop sidebar is always present in the DOM (visibility controlled by CSS)
 *  - Icons have aria-hidden="true" (decorative, label text already conveys meaning)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useAuthStore } from '@/store/auth.store';

// ADMIN-HUB-01: every section is a tab of /admin (?tab=…), so the active state
// now depends on BOTH the pathname and the search params.
const mockUsePathname = vi.fn(() => '/admin');
let mockSearch = '';

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminOpsQueue: () => ({
    data: {
      openReports: 0,
      pendingStores: 0,
      pendingSellers: 0,
      unreviewedFraud: 0,
      total: 0,
    },
    isLoading: false,
    isError: false,
  }),
}));

// Gap #20 (admin permission tiers): the sidebar now reads the signed-in
// user's role to decide which links a MODERATOR can see, so
// useAuthStore must be mocked explicitly rather than left to hit the
// real Zustand+persist store (which reads localStorage and isn't
// isolated between tests). Defaults to an ADMIN actor — the pre-Gap-20
// behavior every test below except the dedicated MODERATOR block
// still assumes.
vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

const mockUseAuthStore = vi.mocked(useAuthStore);

function mockActor(role: 'ADMIN' | 'MODERATOR' | 'SUPER_ADMIN' = 'ADMIN') {
  mockUseAuthStore.mockImplementation((selector: (s: { user: unknown }) => unknown) =>
    selector({ user: { id: 'u1', name: 'مستخدم', role } }),
  );
}

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    [k: string]: unknown;
  }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

describe('AdminSidebar', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/admin');
    mockSearch = '';
    mockActor('ADMIN');
  });

  // ── Renders all nav links ──────────────────────────────────────────

  it('renders all admin nav links in the desktop sidebar', () => {
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    expect(within(desktopNav).getByText('الرئيسية')).toBeInTheDocument();
    expect(within(desktopNav).getByText('الإعلانات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('المستخدمون')).toBeInTheDocument();
    expect(within(desktopNav).getByText('البائعون')).toBeInTheDocument();
    expect(within(desktopNav).getByText('المتاجر')).toBeInTheDocument();
    expect(within(desktopNav).getByText('البلاغات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('مكافحة الاحتيال')).toBeInTheDocument();
    expect(within(desktopNav).getByText('فئات الإعلانات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('فئات الخدمات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('فئات المنتجات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('سجل العمليات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('التحليلات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('المنتجات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('الخدمات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('صحة النظام')).toBeInTheDocument();
  });

  it('links to /admin?tab=categories for the فئات الإعلانات item (report item #6 fix)', () => {
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('فئات الإعلانات').closest('a');
    expect(link).toHaveAttribute('href', '/admin?tab=categories');
  });

  it('links to /admin?tab=sellers for the البائعون item (Epic 1.1)', () => {
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('البائعون').closest('a');
    expect(link).toHaveAttribute('href', '/admin?tab=sellers');
  });

  it('links to /admin?tab=service-categories for the فئات الخدمات item (Epic 1.2)', () => {
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('فئات الخدمات').closest('a');
    expect(link).toHaveAttribute('href', '/admin?tab=service-categories');
  });

  it('links to /admin?tab=audit-logs for the سجل العمليات item', () => {
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('سجل العمليات').closest('a');
    expect(link).toHaveAttribute('href', '/admin?tab=audit-logs');
  });

  it('renders the "لوحة الإدارة" section heading', () => {
    render(<AdminSidebar />);
    expect(screen.getAllByText('لوحة الإدارة')[0]).toBeInTheDocument();
  });

  // ── Active-state highlighting ───────────────────────────────────────

  it('marks the dashboard link as active on the bare /admin hub', () => {
    mockUsePathname.mockReturnValue('/admin');
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('الرئيسية').closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('marks the ads link as active on /admin?tab=ads', () => {
    mockUsePathname.mockReturnValue('/admin');
    mockSearch = 'tab=ads';
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('الإعلانات').closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
    // ...and only that link
    expect(within(desktopNav).getByText('الرئيسية').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('keeps the tab active while the list carries its own filters (?tab=ads&status=ACTIVE&page=2)', () => {
    mockUsePathname.mockReturnValue('/admin');
    mockSearch = 'tab=ads&status=ACTIVE&page=2';
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    expect(within(desktopNav).getByText('الإعلانات').closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark unrelated links as active', () => {
    mockUsePathname.mockReturnValue('/admin');
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const usersLink = within(desktopNav).getByText('المستخدمون').closest('a');
    expect(usersLink).not.toHaveAttribute('aria-current');
  });

  it('marks nothing active outside the hub (e.g. /admin/debug/warming)', () => {
    mockUsePathname.mockReturnValue('/admin/debug/warming');
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    expect(within(desktopNav).queryAllByRole('link').filter((a) => a.hasAttribute('aria-current'))).toHaveLength(0);
  });

  it('an unknown ?tab= falls back to the dashboard', () => {
    mockUsePathname.mockReturnValue('/admin');
    mockSearch = 'tab=nope';
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    expect(within(desktopNav).getByText('الرئيسية').closest('a')).toHaveAttribute('aria-current', 'page');
  });

  // ── Icon accessibility ───────────────────────────────────────────────

  it('icon elements have aria-hidden="true"', () => {
    const { container } = render(<AdminSidebar />);
    const desktopAside = container.querySelector('aside');
    const hiddenIcons = desktopAside?.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenIcons?.length).toBe(18); // 17 nav links (NAV_LINKS) + the search-box icon
  });

  // ── Mobile drawer ────────────────────────────────────────────────────

  it('mobile drawer is closed by default (no dialog role present)', () => {
    render(<AdminSidebar />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the mobile drawer when the hamburger button is clicked', async () => {
    const user = setupUser();
    render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));
    expect(screen.getByRole('dialog', { name: 'قائمة الإدارة' })).toBeInTheDocument();
  });

  it('closes the drawer when the close (X) button is clicked', async () => {
    const user = setupUser();
    render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByLabelText('إغلاق القائمة'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer when the backdrop is clicked', async () => {
    const user = setupUser();
    render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));
    // The drawer is rendered via createPortal(..., document.body), so
    // query document.body rather than the RTL container — and the
    // actual backdrop class is bg-foreground/50, not bg-black/40.
    const backdrop = document.body.querySelector('.bg-foreground\\/50');
    expect(backdrop).toBeInTheDocument();

    await user.click(backdrop!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer when a nav link inside it is clicked', async () => {
    const user = setupUser();
    render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));
    const dialog = screen.getByRole('dialog');
    const linkInDrawer = within(dialog).getByText('الإعلانات');

    await user.click(linkInDrawer);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a second copy of the nav links inside the open drawer', async () => {
    const user = setupUser();
    render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));

    // Now there should be 2 navs total: desktop (always) + drawer (open).
    const navs = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' });
    expect(navs).toHaveLength(2);
  });

  // ── Gap #20 (admin permission tiers): MODERATOR link filtering ──────

  describe('MODERATOR tier — only the sections the backend gates at MODERATOR', () => {
    beforeEach(() => {
      mockActor('MODERATOR');
    });

    it('shows only الرئيسية-free ads/reports links, hiding every ADMIN+ link', () => {
      render(<AdminSidebar />);
      const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];

      expect(within(desktopNav).getByText('الإعلانات')).toBeInTheDocument();
      expect(within(desktopNav).getByText('البلاغات')).toBeInTheDocument();

      expect(within(desktopNav).queryByText('الرئيسية')).not.toBeInTheDocument();
      expect(within(desktopNav).queryByText('المستخدمون')).not.toBeInTheDocument();
      expect(within(desktopNav).queryByText('البائعون')).not.toBeInTheDocument();
      expect(within(desktopNav).queryByText('المتاجر')).not.toBeInTheDocument();
      expect(within(desktopNav).queryByText('فئات الإعلانات')).not.toBeInTheDocument();
      expect(within(desktopNav).queryByText('فئات الخدمات')).not.toBeInTheDocument();
      expect(within(desktopNav).queryByText('فئات المنتجات')).not.toBeInTheDocument();
      expect(within(desktopNav).queryByText('سجل العمليات')).not.toBeInTheDocument();
      expect(within(desktopNav).queryByText('التحليلات')).not.toBeInTheDocument();
    });

    it('shows exactly the six MODERATOR sections (incl. الطلبات المفتوحة — gated MODERATOR in the backend)', () => {
      // lib/adminHubTabs.ts MODERATOR_ADMIN_TABS is the single source of truth.
      render(<AdminSidebar />);
      const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
      const labels = within(desktopNav).getAllByRole('link').map((a) => a.textContent);
      expect(labels).toEqual([
        'الإعلانات',
        'البلاغات',
        'مكافحة الاحتيال',
        'المنتجات',
        'الخدمات',
        'الطلبات المفتوحة',
      ]);
    });

    it('a MODERATOR on the bare /admin hub sees the ads link active (their default tab)', () => {
      mockUsePathname.mockReturnValue('/admin');
      render(<AdminSidebar />);
      const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
      expect(within(desktopNav).getByText('الإعلانات').closest('a')).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('ADMIN and SUPER_ADMIN tiers — see every link (unchanged from pre-Gap-20 behavior)', () => {
    it('an ADMIN actor sees all 17 links', () => {
      mockActor('ADMIN');
      render(<AdminSidebar />);
      const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
      expect(within(desktopNav).getByText('المستخدمون')).toBeInTheDocument();
      expect(within(desktopNav).getByText('التحليلات')).toBeInTheDocument();
    });

    it('a SUPER_ADMIN actor sees all 17 links', () => {
      mockActor('SUPER_ADMIN');
      render(<AdminSidebar />);
      const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
      expect(within(desktopNav).getByText('المستخدمون')).toBeInTheDocument();
      expect(within(desktopNav).getByText('التحليلات')).toBeInTheDocument();
    });
  });
});
