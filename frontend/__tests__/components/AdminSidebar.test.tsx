/**
 * __tests__/components/AdminSidebar.test.tsx
 *
 * Coverage targets (report item #6 — admin layout had no real sidebar):
 *  - Renders all 5 admin nav links, including the newly-added "الفئات" (categories)
 *  - Active-state: aria-current="page" set on the link matching the current pathname
 *  - Active-state: startsWith match for nested routes (e.g. /admin/ads/123)
 *  - Mobile drawer: closed by default, opens on hamburger click, closes on
 *    backdrop click, closes on X click, closes when a nav link is clicked
 *  - Desktop sidebar is always present in the DOM (visibility controlled by CSS)
 *  - Icons have aria-hidden="true" (decorative, label text already conveys meaning)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

const mockUsePathname = vi.fn(() => '/admin/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

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
    mockUsePathname.mockReturnValue('/admin/dashboard');
  });

  // ── Renders all nav links ──────────────────────────────────────────

  it('renders all 5 admin nav links in the desktop sidebar', () => {
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    expect(within(desktopNav).getByText('الرئيسية')).toBeInTheDocument();
    expect(within(desktopNav).getByText('الإعلانات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('المستخدمون')).toBeInTheDocument();
    expect(within(desktopNav).getByText('البلاغات')).toBeInTheDocument();
    expect(within(desktopNav).getByText('الفئات')).toBeInTheDocument();
  });

  it('links to /admin/categories for the الفئات item (report item #6 fix)', () => {
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('الفئات').closest('a');
    expect(link).toHaveAttribute('href', '/admin/categories');
  });

  it('renders the "لوحة الإدارة" section heading', () => {
    render(<AdminSidebar />);
    expect(screen.getAllByText('لوحة الإدارة')[0]).toBeInTheDocument();
  });

  // ── Active-state highlighting ───────────────────────────────────────

  it('marks the dashboard link as active on /admin/dashboard', () => {
    mockUsePathname.mockReturnValue('/admin/dashboard');
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('الرئيسية').closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('marks the ads link as active on /admin/ads', () => {
    mockUsePathname.mockReturnValue('/admin/ads');
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('الإعلانات').closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('marks the ads link as active on a nested route /admin/ads/123 (startsWith match)', () => {
    mockUsePathname.mockReturnValue('/admin/ads/123');
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const link = within(desktopNav).getByText('الإعلانات').closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark unrelated links as active', () => {
    mockUsePathname.mockReturnValue('/admin/dashboard');
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const usersLink = within(desktopNav).getByText('المستخدمون').closest('a');
    expect(usersLink).not.toHaveAttribute('aria-current');
  });

  it('does not false-positive match /admin/ads-extra as active for /admin/ads', () => {
    // startsWith(href + '/') requires the separator, so a route name that
    // merely starts with the same prefix string must not match.
    mockUsePathname.mockReturnValue('/admin/ads-extra');
    render(<AdminSidebar />);
    const desktopNav = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' })[0];
    const adsLink = within(desktopNav).getByText('الإعلانات').closest('a');
    expect(adsLink).not.toHaveAttribute('aria-current');
  });

  // ── Icon accessibility ───────────────────────────────────────────────

  it('icon elements have aria-hidden="true"', () => {
    const { container } = render(<AdminSidebar />);
    const desktopAside = container.querySelector('aside');
    const hiddenIcons = desktopAside?.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenIcons?.length).toBe(5); // one per nav link
  });

  // ── Mobile drawer ────────────────────────────────────────────────────

  it('mobile drawer is closed by default (no dialog role present)', () => {
    render(<AdminSidebar />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the mobile drawer when the hamburger button is clicked', async () => {
    const user = userEvent.setup();
    render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));
    expect(screen.getByRole('dialog', { name: 'قائمة الإدارة' })).toBeInTheDocument();
  });

  it('closes the drawer when the close (X) button is clicked', async () => {
    const user = userEvent.setup();
    render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByLabelText('إغلاق القائمة'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));
    const backdrop = container.querySelector('.bg-black\\/40');
    expect(backdrop).toBeInTheDocument();

    await user.click(backdrop!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer when a nav link inside it is clicked', async () => {
    const user = userEvent.setup();
    render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));
    const dialog = screen.getByRole('dialog');
    const linkInDrawer = within(dialog).getByText('الإعلانات');

    await user.click(linkInDrawer);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a second copy of the nav links inside the open drawer', async () => {
    const user = userEvent.setup();
    render(<AdminSidebar />);

    await user.click(screen.getByLabelText('فتح القائمة'));

    // Now there should be 2 navs total: desktop (always) + drawer (open).
    const navs = screen.getAllByRole('navigation', { name: 'قائمة الإدارة' });
    expect(navs).toHaveLength(2);
  });
});
