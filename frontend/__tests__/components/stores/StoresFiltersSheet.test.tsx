/**
 * __tests__/components/stores/StoresFiltersSheet.test.tsx
 *
 * Covers components/stores/StoresFiltersSheet.tsx () — same
 * shape as search/SearchFiltersSheet.test.tsx and
 * SearchFiltersSheet.test.tsx (ads): active-filter badge count
 * (search/city), closed-by-default, opens on trigger click, and wraps
 * the real StoresFilters once opened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { StoresFiltersSheet } from '@/components/stores/StoresFiltersSheet';

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/StoresFilters', () => ({
  StoresFilters: () => <div data-testid="stores-filters" />,
}));

describe('StoresFiltersSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('shows no badge when no filters are active', () => {
    render(<StoresFiltersSheet />);
    const button = screen.getByRole('button', { name: /تصفية/ });
    expect(button).toHaveTextContent('تصفية');
    expect(screen.queryByText(/^[0-9]+$/)).not.toBeInTheDocument();
  });

  it('counts search as one active filter', () => {
    mockSearchParams = new URLSearchParams({ search: 'أثاث' });
    render(<StoresFiltersSheet />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('counts city as one active filter', () => {
    mockSearchParams = new URLSearchParams({ city: 'غزة' });
    render(<StoresFiltersSheet />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('counts search + city as two active filters', () => {
    mockSearchParams = new URLSearchParams({ search: 'أثاث', city: 'غزة' });
    render(<StoresFiltersSheet />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('ignores sortBy/sortOrder/page when counting active filters', () => {
    mockSearchParams = new URLSearchParams({ sortBy: 'name', sortOrder: 'asc', page: '2' });
    render(<StoresFiltersSheet />);
    expect(screen.queryByText(/^[0-9]+$/)).not.toBeInTheDocument();
  });

  it('does not render the sheet content before the trigger is clicked', () => {
    render(<StoresFiltersSheet />);
    expect(screen.queryByTestId('stores-filters')).not.toBeInTheDocument();
  });

  it('opens the sheet and renders StoresFilters when the trigger is clicked', async () => {
    const user = setupUser();
    render(<StoresFiltersSheet />);

    await user.click(screen.getByRole('button', { name: /تصفية/ }));

    expect(await screen.findByText('تصفية النتائج')).toBeInTheDocument();
    expect(screen.getByTestId('stores-filters')).toBeInTheDocument();
  });
});
