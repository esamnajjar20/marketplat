/**
 * __tests__/components/ProtectedSidebar.test.tsx
 *
 * REORG-04: "خدماتي" and "متجري" became disclosure-group buttons
 * (expand/collapse) instead of plain links — this rewrite reflects
 * that: they're queried as buttons, their children only render once
 * expanded (either by click or by an active pathname inside the
 * group), and "متجري" is new here since it never had a desktop entry
 * point before.
 *
 * Coverage targets:
 *  - Renders top-level nav items (links + the two disclosure buttons)
 *  - Active item: aria-current="page" on the matching pathname
 *  - Inactive items: no aria-current
 *  - Icon spans have aria-hidden="true" (UX-15 FIX)
 *  - Nav has correct aria-label
 *  - Matches /settings/* as active for settings link
 *  - Disclosure groups: closed by default unless pathname is inside them,
 *    expand on click, children link to the right hrefs
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProtectedSidebar } from '@/components/layout/ProtectedSidebar';

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

describe('ProtectedSidebar', () => {
  // ── Renders top-level items ───────────────────────────────────

  it('renders all top-level navigation items', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<ProtectedSidebar />);
    expect(screen.getByText('لوحة التحكم')).toBeDefined();
    expect(screen.getByText('إعلاناتي')).toBeDefined();
    expect(screen.getByText('المفضلة')).toBeDefined();
    expect(screen.getByText('البحثات المحفوظة')).toBeDefined();
    expect(screen.getByText('نشاطي')).toBeDefined();
    expect(screen.getByText('الرسائل')).toBeDefined();
    expect(screen.getByText('بلاغاتي')).toBeDefined();
    expect(screen.getByText('الإعدادات')).toBeDefined();
    // REORG-04: disclosure group roots — rendered as buttons, not links.
    expect(screen.getByRole('button', { name: /خدماتي/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /متجري/ })).toBeDefined();
  });

  it('renders a nav landmark with aria-label', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<ProtectedSidebar />);
    expect(screen.getByRole('navigation', { name: 'القائمة الشخصية' })).toBeDefined();
  });

  // ── Active state ───────────────────────────────────────────────

  it('sets aria-current="page" on the active link (/dashboard)', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<ProtectedSidebar />);
    const activeLink = screen.getByText('لوحة التحكم').closest('a');
    expect(activeLink?.getAttribute('aria-current')).toBe('page');
  });

  it('does NOT set aria-current on inactive links when on /dashboard', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<ProtectedSidebar />);
    const inactiveLinks = ['إعلاناتي', 'المفضلة', 'الرسائل', 'الإعدادات'].map(
      (label) => screen.getByText(label).closest('a'),
    );
    inactiveLinks.forEach((link) => {
      expect(link?.getAttribute('aria-current')).toBeNull();
    });
  });

  it('sets aria-current on /my-ads link when pathname is /my-ads', () => {
    mockUsePathname.mockReturnValue('/my-ads');
    render(<ProtectedSidebar />);
    const link = screen.getByText('إعلاناتي').closest('a');
    expect(link?.getAttribute('aria-current')).toBe('page');
  });

  it('sets aria-current on /favorites when pathname is /favorites', () => {
    mockUsePathname.mockReturnValue('/favorites');
    render(<ProtectedSidebar />);
    expect(screen.getByText('المفضلة').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  it('sets aria-current on /activity when pathname is /activity', () => {
    mockUsePathname.mockReturnValue('/activity');
    render(<ProtectedSidebar />);
    expect(screen.getByText('نشاطي').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  it('sets aria-current on settings link for /settings/profile (startsWith match)', () => {
    mockUsePathname.mockReturnValue('/settings/profile');
    render(<ProtectedSidebar />);
    const settingsLink = screen.getByText('الإعدادات').closest('a');
    expect(settingsLink?.getAttribute('aria-current')).toBe('page');
  });

  it('sets aria-current on settings link for /settings/security (startsWith match)', () => {
    mockUsePathname.mockReturnValue('/settings/security');
    render(<ProtectedSidebar />);
    expect(screen.getByText('الإعدادات').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  it('only one top-level link is active at a time', () => {
    mockUsePathname.mockReturnValue('/my-ads');
    render(<ProtectedSidebar />);
    const links = screen.getAllByRole('link');
    const activeLinkCount = links.filter(
      (l) => l.getAttribute('aria-current') === 'page',
    ).length;
    expect(activeLinkCount).toBe(1);
  });

  // ── Icon aria-hidden (UX-15 FIX) ──────────────────────────────

  it('icon spans have aria-hidden="true"', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    const { container } = render(<ProtectedSidebar />);
    const iconSpans = container.querySelectorAll('[aria-hidden="true"]');
    // 8 top-level items (each with an icon) + 2 disclosure-group icons
    // + 2 chevrons (also aria-hidden, one per closed group) = 12.
    expect(iconSpans.length).toBe(12);
  });

  // ── Correct hrefs ──────────────────────────────────────────────

  it('dashboard link points to /dashboard', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<ProtectedSidebar />);
    const link = screen.getByText('لوحة التحكم').closest('a');
    expect(link?.getAttribute('href')).toBe('/dashboard');
  });

  it('my-ads link points to /my-ads', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<ProtectedSidebar />);
    const link = screen.getByText('إعلاناتي').closest('a');
    expect(link?.getAttribute('href')).toBe('/my-ads');
  });

  it('settings link points to /settings/profile', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<ProtectedSidebar />);
    const link = screen.getByText('الإعدادات').closest('a');
    expect(link?.getAttribute('href')).toBe('/settings/profile');
  });

  // ── REORG-04: disclosure groups ─────────────────────────────────

  describe('"خدماتي" disclosure group', () => {
    it('is collapsed by default when pathname is outside the group', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      render(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /خدماتي/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText('الطلبات الواردة')).not.toBeInTheDocument();
    });

    it('expands on click and reveals its children', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      render(<ProtectedSidebar />);
      fireEvent.click(screen.getByRole('button', { name: /خدماتي/ }));
      expect(screen.getByText('الطلبات الواردة').closest('a')?.getAttribute('href')).toBe('/my-services/requests');
      expect(screen.getByText('مواعيدي').closest('a')?.getAttribute('href')).toBe('/my-services/appointments');
      expect(screen.getByText('طلباتي').closest('a')?.getAttribute('href')).toBe('/my-requests');
    });

    it('is expanded by default when pathname is inside the group (e.g. /my-requests)', () => {
      mockUsePathname.mockReturnValue('/my-requests');
      render(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /خدماتي/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('طلباتي')).toBeDefined();
    });
  });

  describe('"متجري" disclosure group', () => {
    it('is collapsed by default when pathname is outside the group', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      render(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /متجري/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText('المتاجر المتابَعة')).not.toBeInTheDocument();
    });

    it('expands on click and reveals its children', () => {
      mockUsePathname.mockReturnValue('/dashboard');
      render(<ProtectedSidebar />);
      fireEvent.click(screen.getByRole('button', { name: /متجري/ }));
      expect(screen.getByText('منتجاتي').closest('a')?.getAttribute('href')).toBe('/my-store/products');
      expect(screen.getByText('المتاجر المتابَعة').closest('a')?.getAttribute('href')).toBe('/my-store/followed');
    });

    it('is expanded by default when pathname is inside the group (e.g. /my-store/followed)', () => {
      mockUsePathname.mockReturnValue('/my-store/followed');
      render(<ProtectedSidebar />);
      const toggle = screen.getByRole('button', { name: /متجري/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });
  });
});
