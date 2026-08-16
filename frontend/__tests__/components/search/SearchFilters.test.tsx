/**
 * __tests__/components/search/SearchFilters.test.tsx
 *
 * Covers components/search/SearchFilters.tsx:
 *   - the category filter is hidden for type=all/stores, shown for
 *     ads/products/services, with the right category source per type.
 *   - city select pushes the corresponding param and drops page.
 *   - reset preserves q but drops every other filter.
 *
 * Sort moved out to the shared SearchSortBar (audit item #8, FIX
 * P2-08) — its own coverage (single-param mode, the sort/page
 * interaction, and the wrapper's distance-option logic) lives in
 * __tests__/components/shared/SearchSortBar.test.tsx and
 * __tests__/components/search/SearchSortBarWrapper.test.tsx instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SearchFilters } from '@/components/search/SearchFilters';
import { useCategories } from '@/hooks/queries/useCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/queries/useCategories', () => ({ useCategories: vi.fn() }));
vi.mock('@/hooks/queries/useProductCategories', () => ({ useProductCategories: vi.fn() }));
vi.mock('@/hooks/queries/useServiceCategories', () => ({ useServiceCategories: vi.fn() }));

// SearchNearbyToggle has its own dedicated test file — stub it here so
// SearchFilters' own city/category/sort/reset logic is what's under test.
vi.mock('@/components/search/SearchNearbyToggle', () => ({
  SearchNearbyToggle: () => <div data-testid="nearby-toggle" />,
}));

function paramsFromPush(callIndex = 0) {
  const url = mockPush.mock.calls[callIndex][0] as string;
  return new URLSearchParams(url.split('?')[1]);
}

describe('SearchFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    vi.mocked(useCategories).mockReturnValue({
      data: [{ id: 'ad-cat-1', nameAr: 'إلكترونيات', children: [] }],
    } as never);
    vi.mocked(useProductCategories).mockReturnValue({
      data: [{ id: 'prod-cat-1', nameAr: 'أثاث' }],
    } as never);
    vi.mocked(useServiceCategories).mockReturnValue({
      data: [{ id: 'svc-cat-1', nameAr: 'صيانة' }],
    } as never);
  });

  describe('category filter visibility', () => {
    it('is hidden when type is "all"', () => {
      render(<SearchFilters />);
      expect(screen.queryByText('الفئة')).not.toBeInTheDocument();
    });

    it('is hidden when type is "stores"', () => {
      mockSearchParams = new URLSearchParams({ type: 'stores' });
      render(<SearchFilters />);
      expect(screen.queryByText('الفئة')).not.toBeInTheDocument();
    });

    it('is shown for type=ads and lists ad categories', async () => {
      mockSearchParams = new URLSearchParams({ type: 'ads' });
      const user = setupUser();
      render(<SearchFilters />);

      expect(screen.getByText('الفئة')).toBeInTheDocument();
      const combos = screen.getAllByRole('combobox');
      await user.click(combos[0]); // category select is first when shown
      expect(await screen.findByRole('option', { name: 'إلكترونيات' })).toBeInTheDocument();
    });

    it('is shown for type=products and lists product categories', async () => {
      mockSearchParams = new URLSearchParams({ type: 'products' });
      const user = setupUser();
      render(<SearchFilters />);

      const combos = screen.getAllByRole('combobox');
      await user.click(combos[0]);
      expect(await screen.findByRole('option', { name: 'أثاث' })).toBeInTheDocument();
    });

    it('is shown for type=services and lists service categories', async () => {
      mockSearchParams = new URLSearchParams({ type: 'services' });
      const user = setupUser();
      render(<SearchFilters />);

      const combos = screen.getAllByRole('combobox');
      await user.click(combos[0]);
      expect(await screen.findByRole('option', { name: 'صيانة' })).toBeInTheDocument();
    });
  });

  it('sets categoryId and drops page when a category is picked', async () => {
    mockSearchParams = new URLSearchParams({ type: 'products', page: '2' });
    const user = setupUser();
    render(<SearchFilters />);

    const combos = screen.getAllByRole('combobox');
    await user.click(combos[0]);
    await user.click(await screen.findByRole('option', { name: 'أثاث' }));

    const params = paramsFromPush();
    expect(params.get('categoryId')).toBe('prod-cat-1');
    expect(params.has('page')).toBe(false);
  });

  it('deletes categoryId when "كل الفئات" is chosen', async () => {
    mockSearchParams = new URLSearchParams({ type: 'products', categoryId: 'prod-cat-1' });
    const user = setupUser();
    render(<SearchFilters />);

    const combos = screen.getAllByRole('combobox');
    await user.click(combos[0]);
    await user.click(await screen.findByRole('option', { name: 'كل الفئات' }));

    const params = paramsFromPush();
    expect(params.has('categoryId')).toBe(false);
  });

  it('sets the city param and drops page when a city is picked', async () => {
    mockSearchParams = new URLSearchParams({ page: '4' });
    const user = setupUser();
    render(<SearchFilters />);

    // type=all -> only the city combo is rendered (no category select,
    // sort lives in SearchSortBar now).
    const combos = screen.getAllByRole('combobox');
    await user.click(combos[0]);
    await user.click(await screen.findByRole('option', { name: 'غزة' }));

    const params = paramsFromPush();
    expect(params.get('city')).toBe('غزة');
    expect(params.has('page')).toBe(false);
  });

  it('reset keeps q but drops every other filter', async () => {
    mockSearchParams = new URLSearchParams({
      q: 'هاتف', type: 'products', categoryId: 'prod-cat-1', city: 'غزة', sort: 'newest', page: '2',
    });
    const user = setupUser();
    render(<SearchFilters />);

    await user.click(screen.getByRole('button', { name: 'إعادة تعيين الفلاتر' }));

    expect(mockPush).toHaveBeenCalledWith(`${ROUTES.search}?q=${encodeURIComponent('هاتف')}`);
  });

  it('reset navigates to the bare search route when there is no q', async () => {
    mockSearchParams = new URLSearchParams({ city: 'غزة', sort: 'newest' });
    const user = setupUser();
    render(<SearchFilters />);

    await user.click(screen.getByRole('button', { name: 'إعادة تعيين الفلاتر' }));

    expect(mockPush).toHaveBeenCalledWith(ROUTES.search);
  });

  it('renders the nearby toggle under the location label', () => {
    render(<SearchFilters />);
    expect(screen.getByText('الموقع')).toBeInTheDocument();
    expect(screen.getByTestId('nearby-toggle')).toBeInTheDocument();
  });
});
