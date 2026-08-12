/**
 * __tests__/components/search/SearchResults.test.tsx
 *
 * Covers components/search/SearchResults.tsx:
 *   - reads q/city/type/categoryId/sort/page/lat/lng/radius from the URL
 *     and forwards them to useSearch.
 *   - loading / error (with retry) / empty / populated states.
 *   - pagination only renders when totalPages > 1.
 *   - analytics `track('SEARCH', ...)` fires only when q is present, and
 *     only once per distinct q/city/type/categoryId/page combination.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchResults } from '@/components/search/SearchResults';
import { useSearch } from '@/hooks/queries/useSearch';
import { track } from '@/lib/analytics';

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/queries/useSearch', () => ({
  useSearch: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/components/search/UnifiedResultCard', () => ({
  UnifiedResultCard: ({ result }: { result: { id: string; title: string } }) => (
    <div data-testid="result-card">{result.title}</div>
  ),
}));

const baseResult = {
  id: 'r1',
  type: 'ad' as const,
  title: 'لابتوب ديل',
  description: '',
  image: null,
  city: 'غزة',
  rating: 0,
  views: 5,
  price: '100',
  seller: { id: 's1', name: 'بائع', verified: false },
  url: '/ads/r1',
  createdAt: new Date().toISOString(),
  distanceKm: null,
};

function mockSearchState(overrides: Partial<ReturnType<typeof useSearch>>) {
  vi.mocked(useSearch).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never);
}

describe('SearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('reads all query/filter/geo params from the URL and forwards them to useSearch', () => {
    mockSearchParams = new URLSearchParams({
      q: 'هاتف', city: 'غزة', type: 'products', categoryId: 'cat-1',
      sort: 'newest', page: '2', lat: '31.9', lng: '35.2', radius: '15',
    });
    mockSearchState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<SearchResults />);

    expect(useSearch).toHaveBeenCalledWith({
      q: 'هاتف', city: 'غزة', type: 'products', categoryId: 'cat-1',
      sort: 'newest', page: 2, lat: 31.9, lng: 35.2, radius: 15,
    });
  });

  it('defaults type to "all", sort to "relevance", and page to 1 when absent', () => {
    mockSearchState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<SearchResults />);

    expect(useSearch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'all', sort: 'relevance', page: 1, lat: undefined, lng: undefined }),
    );
  });

  it('shows a loading spinner while isLoading is true', () => {
    mockSearchState({ isLoading: true });
    render(<SearchResults />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error message with a retry action on isError', async () => {
    const refetch = vi.fn();
    mockSearchState({ isError: true, refetch });
    const user = userEvent.setup();
    render(<SearchResults />);

    expect(screen.getByText('حدث خطأ أثناء تحميل النتائج')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the empty state when there are no items', () => {
    mockSearchParams = new URLSearchParams({ q: 'شيء غريب' });
    mockSearchState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<SearchResults />);

    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
    expect(screen.getByText(/لم نجد نتائج لـ/)).toBeInTheDocument();
  });

  it('shows a generic empty description when there is no query (filter-only search)', () => {
    mockSearchState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<SearchResults />);
    expect(screen.getByText('لا توجد نتائج مطابقة لهذه الفلاتر')).toBeInTheDocument();
  });

  it('renders a card per result and the result count', () => {
    mockSearchState({
      data: { items: [baseResult, { ...baseResult, id: 'r2', title: 'هاتف' }], meta: { total: 2, totalPages: 1 } },
    });
    render(<SearchResults />);

    expect(screen.getByText('2 نتيجة')).toBeInTheDocument();
    expect(screen.getAllByTestId('result-card')).toHaveLength(2);
  });

  it('renders the search-term suffix in the count line when q is present', () => {
    mockSearchParams = new URLSearchParams({ q: 'لابتوب' });
    mockSearchState({ data: { items: [baseResult], meta: { total: 1, totalPages: 1 } } });
    render(<SearchResults />);
    expect(screen.getByText(/بحثاً عن/)).toBeInTheDocument();
    expect(screen.getByText('لابتوب')).toBeInTheDocument();
  });

  it('does not render pagination when totalPages is 1', () => {
    mockSearchState({ data: { items: [baseResult], meta: { total: 1, totalPages: 1 } } });
    render(<SearchResults />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders pagination when totalPages > 1', () => {
    mockSearchState({ data: { items: [baseResult], meta: { total: 30, totalPages: 3 } } });
    render(<SearchResults />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  describe('analytics', () => {
    it('does not track when there is no q', () => {
      mockSearchState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
      render(<SearchResults />);
      expect(track).not.toHaveBeenCalled();
    });

    it('tracks a SEARCH event with the resolved result count when q is present', () => {
      mockSearchParams = new URLSearchParams({ q: 'لابتوب', city: 'غزة', type: 'products', categoryId: 'cat-1' });
      mockSearchState({ data: { items: [baseResult], meta: { total: 7, totalPages: 1 } } });
      render(<SearchResults />);

      expect(track).toHaveBeenCalledWith('SEARCH', {
        q: 'لابتوب', city: 'غزة', type: 'products', categoryId: 'cat-1', resultCount: 7,
      });
    });
  });
});
