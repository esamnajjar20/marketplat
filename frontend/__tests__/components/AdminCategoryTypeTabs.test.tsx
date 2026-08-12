/**
 * __tests__/components/AdminCategoryTypeTabs.test.tsx
 *
 * Real logic under test: which tab is marked active (aria-selected)
 * based on the current pathname, and that each tab links to its own
 * real route (FIX P2-9 — see file header: these stay independently
 * linkable pages, not client-side tab state).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminCategoryTypeTabs } from '@/components/admin/AdminCategoryTypeTabs';
import { usePathname } from 'next/navigation';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

const mockUsePathname = vi.mocked(usePathname);

describe('AdminCategoryTypeTabs', () => {
  it('renders all three category type tabs with correct hrefs', () => {
    mockUsePathname.mockReturnValue('/admin/categories');
    render(<AdminCategoryTypeTabs />);

    expect(screen.getByText('فئات الإعلانات').closest('a')).toHaveAttribute('href', '/admin/categories');
    expect(screen.getByText('فئات المنتجات').closest('a')).toHaveAttribute('href', '/admin/product-categories');
    expect(screen.getByText('فئات الخدمات').closest('a')).toHaveAttribute('href', '/admin/service-categories');
  });

  it('marks the ad categories tab as selected when on /admin/categories', () => {
    mockUsePathname.mockReturnValue('/admin/categories');
    render(<AdminCategoryTypeTabs />);

    expect(screen.getByText('فئات الإعلانات').closest('a')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('فئات المنتجات').closest('a')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('فئات الخدمات').closest('a')).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the product categories tab as selected when on /admin/product-categories', () => {
    mockUsePathname.mockReturnValue('/admin/product-categories');
    render(<AdminCategoryTypeTabs />);

    expect(screen.getByText('فئات المنتجات').closest('a')).toHaveAttribute('aria-selected', 'true');
  });

  it('marks the service categories tab as selected when on /admin/service-categories', () => {
    mockUsePathname.mockReturnValue('/admin/service-categories');
    render(<AdminCategoryTypeTabs />);

    expect(screen.getByText('فئات الخدمات').closest('a')).toHaveAttribute('aria-selected', 'true');
  });

  it('marks no tab as selected when on an unrelated route', () => {
    mockUsePathname.mockReturnValue('/admin/dashboard');
    render(<AdminCategoryTypeTabs />);

    for (const label of ['فئات الإعلانات', 'فئات المنتجات', 'فئات الخدمات']) {
      expect(screen.getByText(label).closest('a')).toHaveAttribute('aria-selected', 'false');
    }
  });

  it('exposes a tablist role for accessibility', () => {
    mockUsePathname.mockReturnValue('/admin/categories');
    render(<AdminCategoryTypeTabs />);
    expect(screen.getByRole('tablist', { name: 'نوع الفئات' })).toBeInTheDocument();
  });
});
