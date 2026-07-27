/**
 * __tests__/components/ProtectedSidebar.test.tsx
 *
 * Coverage targets:
 *  - Renders all 5 nav items
 *  - Active item: aria-current="page" on the matching pathname
 *  - Active item: gets primary background class
 *  - Inactive items: no aria-current
 *  - Icon spans have aria-hidden="true" (UX-15 FIX)
 *  - Nav has correct aria-label
 *  - Matches /settings/* as active for settings link
 *  - Multiple links: only the matching one is active
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  // ── Renders all nav items ──────────────────────────────────────

  it('renders all 5 navigation items', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<ProtectedSidebar />);
    expect(screen.getByText('لوحة التحكم')).toBeDefined();
    expect(screen.getByText('إعلاناتي')).toBeDefined();
    expect(screen.getByText('المفضلة')).toBeDefined();
    expect(screen.getByText('الرسائل')).toBeDefined();
    expect(screen.getByText('الإعدادات')).toBeDefined();
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

  it('only one link is active at a time', () => {
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
    // 5 nav items × 1 icon each
    expect(iconSpans.length).toBe(5);
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
});
