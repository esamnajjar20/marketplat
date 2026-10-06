/**
 * __tests__/components/stores/ProductsFiltersSheet.test.tsx
 *
 * PROMO-1 (, full scope): mirrors StoresFiltersSheet.test.tsx
 * exactly — active-filter badge count (search/city/hasPromotion),
 * closed-by-default, opens on trigger click, wraps the real
 * ProductsFilters once opened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ProductsFiltersSheet } from '@/components/stores/ProductsFiltersSheet';

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/ProductsFilters', () => ({
  ProductsFilters: () => <div data-testid="products-filters" />,
}));

describe('ProductsFiltersSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('shows no badge when no filters are active', () => {
    render(<ProductsFiltersSheet />);
    const button = screen.getByRole('button', { name: /تصفية/ });
    expect(button).toHaveTextContent('تصفية');
    expect(screen.queryByText(/^[0-9]+$/)).not.toBeInTheDocument();
  });

  it('counts search as one active filter', () => {
    mockSearchParams = new URLSearchParams({ search: 'خلاط' });
    render(<ProductsFiltersSheet />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('counts city as one active filter', () => {
    mockSearchParams = new URLSearchParams({ city: 'غزة' });
    render(<ProductsFiltersSheet />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('counts hasPromotion as one active filter', () => {
    mockSearchParams = new URLSearchParams({ hasPromotion: 'true' });
    render(<ProductsFiltersSheet />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('counts search + city + hasPromotion as three active filters', () => {
    mockSearchParams = new URLSearchParams({ search: 'خلاط', city: 'غزة', hasPromotion: 'true' });
    render(<ProductsFiltersSheet />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('ignores sortBy/sortOrder/page when counting active filters', () => {
    mockSearchParams = new URLSearchParams({ sortBy: 'price', sortOrder: 'asc', page: '2' });
    render(<ProductsFiltersSheet />);
    expect(screen.queryByText(/^[0-9]+$/)).not.toBeInTheDocument();
  });

  it('does not render the sheet content before the trigger is clicked', () => {
    render(<ProductsFiltersSheet />);
    expect(screen.queryByTestId('products-filters')).not.toBeInTheDocument();
  });

  it('opens the sheet and renders ProductsFilters when the trigger is clicked', async () => {
    const user = setupUser();
    render(<ProductsFiltersSheet />);

    await user.click(screen.getByRole('button', { name: /تصفية/ }));

    expect(await screen.findByText('تصفية النتائج')).toBeInTheDocument();
    expect(screen.getByTestId('products-filters')).toBeInTheDocument();
  });
});
