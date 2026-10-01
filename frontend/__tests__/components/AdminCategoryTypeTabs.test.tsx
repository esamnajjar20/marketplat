/**
 * __tests__/components/AdminCategoryTypeTabs.test.tsx
 *
 * Real logic under test: which tab is marked active (aria-selected) from the
 * `active` prop the admin hub passes, and that each tab links to its own
 * hub tab (ADMIN-HUB-01: the three category types are tabs of /admin, no
 * longer separate pages, so the strip no longer reads the pathname).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminCategoryTypeTabs } from '@/components/admin/AdminCategoryTypeTabs';

describe('AdminCategoryTypeTabs', () => {
  it('renders all three category type tabs with correct hrefs', () => {
    render(<AdminCategoryTypeTabs active="categories" />);

    expect(screen.getByText('فئات الإعلانات').closest('a')).toHaveAttribute('href', '/admin?tab=categories');
    expect(screen.getByText('فئات المنتجات').closest('a')).toHaveAttribute('href', '/admin?tab=product-categories');
    expect(screen.getByText('فئات الخدمات').closest('a')).toHaveAttribute('href', '/admin?tab=service-categories');
  });

  it('marks the ad categories tab as selected when active="categories"', () => {
    render(<AdminCategoryTypeTabs active="categories" />);

    expect(screen.getByText('فئات الإعلانات').closest('a')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('فئات المنتجات').closest('a')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('فئات الخدمات').closest('a')).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the product categories tab as selected when active="product-categories"', () => {
    render(<AdminCategoryTypeTabs active="product-categories" />);

    expect(screen.getByText('فئات المنتجات').closest('a')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('فئات الإعلانات').closest('a')).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the service categories tab as selected when active="service-categories"', () => {
    render(<AdminCategoryTypeTabs active="service-categories" />);

    expect(screen.getByText('فئات الخدمات').closest('a')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('فئات الإعلانات').closest('a')).toHaveAttribute('aria-selected', 'false');
  });

  it('exposes a tablist role for accessibility', () => {
    render(<AdminCategoryTypeTabs active="categories" />);
    expect(screen.getByRole('tablist', { name: 'نوع الفئات' })).toBeInTheDocument();
  });
});
