/**
 * __tests__/components/SearchFiltersSheet.test.tsx
 *
 * Real logic under test: the active-filter count badge (counts city,
 * condition, minPrice, maxPrice — plus categoryId, but ONLY when there
 * is no categorySlug, since on a category page ?categoryId= would just
 * be the page's own context echoed back, not a filter the user set),
 * and the sheet's open/close state via the trigger button. SearchFilters
 * itself has its own dedicated test suite and is stubbed here.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchFiltersSheet } from '@/components/ads/SearchFiltersSheet';
import { useSearchParams } from 'next/navigation';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

vi.mock('@/components/ads/SearchFilters', () => ({
  SearchFilters: () => <div data-testid="search-filters" />,
}));

const mockUseSearchParams = vi.mocked(useSearchParams);

describe('SearchFiltersSheet', () => {
  it('shows no count badge when there are no active filters', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams() as never);
    render(<SearchFiltersSheet />);
    expect(screen.getByText('تصفية')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('counts city, condition, minPrice, maxPrice as active filters', () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('city=غزة&condition=NEW&minPrice=10&maxPrice=100') as never,
    );
    render(<SearchFiltersSheet />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('counts categoryId as an active filter when there is no categorySlug', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('categoryId=cat-1') as never);
    render(<SearchFiltersSheet />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('does NOT count categoryId when categorySlug is present (it is page context, not a filter)', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('categoryId=cat-1') as never);
    render(<SearchFiltersSheet categorySlug="electronics" />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('opens the sheet when the trigger button is clicked', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams() as never);
    const user = userEvent.setup();
    render(<SearchFiltersSheet />);

    expect(screen.queryByText('تصفية النتائج')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /تصفية/ }));
    expect(await screen.findByText('تصفية النتائج')).toBeInTheDocument();
  });
});
