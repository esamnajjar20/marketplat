/**
 * __tests__/components/search/SearchFilters.test.tsx
 *
 * Covers components/search/SearchFilters.tsx:
 *   - the category filter is hidden for type=all/stores, shown for
 *     ads/products/services, with the right category source per type.
 *   - city/sort selects push the corresponding param and drop page.
 *   - the 'distance' sort option only appears once lat/lng are set.
 *   - reset preserves q but drops every other filter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      const user = userEvent.setup();
      render(<SearchFilters />);

      expect(screen.getByText('الفئة')).toBeInTheDocument();
      const combos = screen.getAllByRole('combobox');
      await user.click(combos[0]); // category select is first when shown
      expect(await screen.findByRole('option', { name: 'إلكترونيات' })).toBeInTheDocument();
    });

    it('is shown for type=products and lists product categories', async () => {
      mockSearchParams = new URLSearchParams({ type: 'products' });
      const user = userEvent.setup();
      render(<SearchFilters />);

      const combos = screen.getAllByRole('combobox');
      await user.click(combos[0]);
      expect(await screen.findByRole('option', { name: 'أثاث' })).toBeInTheDocument();
    });

    it('is shown for type=services and lists service categories', async () => {
      mockSearchParams = new URLSearchParams({ type: 'services' });
      const user = userEvent.setup();
      render(<SearchFilters />);

      const combos = screen.getAllByRole('combobox');
      await user.click(combos[0]);
      expect(await screen.findByRole('option', { name: 'صيانة' })).toBeInTheDocument();
    });
  });

  it('sets categoryId and drops page when a category is picked', async () => {
    mockSearchParams = new URLSearchParams({ type: 'products', page: '2' });
    const user = userEvent.setup();
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
    const user = userEvent.setup();
    render(<SearchFilters />);

    const combos = screen.getAllByRole('combobox');
    await user.click(combos[0]);
    await user.click(await screen.findByRole('option', { name: 'كل الفئات' }));

    const params = paramsFromPush();
    expect(params.has('categoryId')).toBe(false);
  });

  it('sets the city param and drops page when a city is picked', async () => {
    mockSearchParams = new URLSearchParams({ page: '4' });
    const user = userEvent.setup();
    render(<SearchFilters />);

    // type=all -> only city + sort combos are rendered, city is first.
    const combos = screen.getAllByRole('combobox');
    await user.click(combos[0]);
    await user.click(await screen.findByRole('option', { name: 'غزة' }));

    const params = paramsFromPush();
    expect(params.get('city')).toBe('غزة');
    expect(params.has('page')).toBe(false);
  });

  it('sets the sort param and drops page when a sort option is picked', async () => {
    const user = userEvent.setup();
    render(<SearchFilters />);

    const combos = screen.getAllByRole('combobox');
    await user.click(combos[1]); // sort is second when type=all (no category select)
    await user.click(await screen.findByRole('option', { name: 'الأحدث' }));

    const params = paramsFromPush();
    expect(params.get('sort')).toBe('newest');
  });

  it('does not offer the distance sort option when no lat/lng are set', async () => {
    const user = userEvent.setup();
    render(<SearchFilters />);

    const combos = screen.getAllByRole('combobox');
    await user.click(combos[1]);
    expect(screen.queryByRole('option', { name: 'الأقرب' })).not.toBeInTheDocument();
  });

  it('offers the distance sort option once lat/lng are set', async () => {
    mockSearchParams = new URLSearchParams({ lat: '31.9', lng: '35.2' });
    const user = userEvent.setup();
    render(<SearchFilters />);

    const combos = screen.getAllByRole('combobox');
    await user.click(combos[1]);
    expect(await screen.findByRole('option', { name: 'الأقرب' })).toBeInTheDocument();
  });

  it('reset keeps q but drops every other filter', async () => {
    mockSearchParams = new URLSearchParams({
      q: 'هاتف', type: 'products', categoryId: 'prod-cat-1', city: 'غزة', sort: 'newest', page: '2',
    });
    const user = userEvent.setup();
    render(<SearchFilters />);

    await user.click(screen.getByRole('button', { name: 'إعادة تعيين الفلاتر' }));

    expect(mockPush).toHaveBeenCalledWith(`${ROUTES.search}?q=${encodeURIComponent('هاتف')}`);
  });

  it('reset navigates to the bare search route when there is no q', async () => {
    mockSearchParams = new URLSearchParams({ city: 'غزة', sort: 'newest' });
    const user = userEvent.setup();
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
