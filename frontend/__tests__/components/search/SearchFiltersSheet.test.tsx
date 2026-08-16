/**
 * __tests__/components/search/SearchFiltersSheet.test.tsx
 *
 * Covers components/search/SearchFiltersSheet.tsx (FIX P1-2):
 *   - active-filter badge count (city/categoryId/lat+lng counted as one).
 *   - sheet is closed by default and opens on trigger click.
 *   - the wrapped SearchFilters renders inside the sheet once opened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SearchFiltersSheet } from '@/components/search/SearchFiltersSheet';

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/search/SearchFilters', () => ({
  SearchFilters: () => <div data-testid="search-filters" />,
}));

describe('SearchFiltersSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('shows no badge when no filters are active', () => {
    render(<SearchFiltersSheet />);
    const button = screen.getByRole('button', { name: /تصفية/ });
    expect(button).toHaveTextContent('تصفية');
    // No numeric badge span rendered.
    expect(screen.queryByText(/^[0-9]+$/)).not.toBeInTheDocument();
  });

  it('counts city as one active filter', () => {
    mockSearchParams = new URLSearchParams({ city: 'غزة' });
    render(<SearchFiltersSheet />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('counts city + categoryId as two active filters', () => {
    mockSearchParams = new URLSearchParams({ city: 'غزة', categoryId: 'cat-1' });
    render(<SearchFiltersSheet />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('counts lat+lng together as a single active filter, not two', () => {
    mockSearchParams = new URLSearchParams({ lat: '31.9', lng: '35.2' });
    render(<SearchFiltersSheet />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('counts city + geo (lat+lng) as two active filters total', () => {
    mockSearchParams = new URLSearchParams({ city: 'غزة', lat: '31.9', lng: '35.2' });
    render(<SearchFiltersSheet />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('ignores q, type, and page when counting active filters', () => {
    mockSearchParams = new URLSearchParams({ q: 'هاتف', type: 'products', page: '2' });
    render(<SearchFiltersSheet />);
    expect(screen.queryByText(/^[0-9]+$/)).not.toBeInTheDocument();
  });

  it('does not render the sheet content before the trigger is clicked', () => {
    render(<SearchFiltersSheet />);
    expect(screen.queryByTestId('search-filters')).not.toBeInTheDocument();
  });

  it('opens the sheet and renders SearchFilters when the trigger is clicked', async () => {
    const user = setupUser();
    render(<SearchFiltersSheet />);

    await user.click(screen.getByRole('button', { name: /تصفية/ }));

    expect(await screen.findByText('تصفية النتائج')).toBeInTheDocument();
    expect(screen.getByTestId('search-filters')).toBeInTheDocument();
  });
});
