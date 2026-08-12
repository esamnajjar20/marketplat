/**
 * __tests__/components/search/SearchTabs.test.tsx
 *
 * Covers components/search/SearchTabs.tsx — plain controlled tab strip.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchTabs } from '@/components/search/SearchTabs';

describe('SearchTabs', () => {
  it('renders all five tabs', () => {
    render(<SearchTabs value="all" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist', { name: 'نوع النتائج' })).toBeInTheDocument();
    ['الكل', 'المنتجات', 'المحلات', 'الإعلانات', 'الخدمات'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
  });

  it('marks only the active tab as selected', () => {
    render(<SearchTabs value="products" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'المنتجات' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'الكل' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'المحلات' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with the clicked tab value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchTabs value="all" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'الخدمات' }));
    expect(onChange).toHaveBeenCalledWith('services');
  });

  it('calls onChange even when clicking the already-active tab', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchTabs value="stores" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'المحلات' }));
    expect(onChange).toHaveBeenCalledWith('stores');
  });
});
