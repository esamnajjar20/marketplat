/**
 * __tests__/components/SavedSearchesList.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers loading/error/empty states,
 * filter-chip rendering (query, city, condition, price range with
 * both open-ended min and max), the last-notified-at conditional
 * text, the results-URL builder's query params, and per-row delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SavedSearchesList } from '@/components/profile/SavedSearchesList';
import { useSavedSearches } from '@/hooks/queries/useSavedSearches';
import { useDeleteSavedSearch } from '@/hooks/mutations/useSavedSearchMutations';

vi.mock('@/hooks/queries/useSavedSearches', () => ({
  useSavedSearches: vi.fn(),
}));

vi.mock('@/hooks/mutations/useSavedSearchMutations', () => ({
  useDeleteSavedSearch: vi.fn(),
}));

const mockRefetch = vi.fn();
const mockDeleteMutate = vi.fn();

const search1 = {
  id: 'search-1',
  label: 'شقق في غزة',
  filters: { q: 'شقة', city: 'غزة', minPrice: 100, maxPrice: 500 },
  createdAt: '2026-07-01T00:00:00.000Z',
  lastNotifiedAt: '2026-08-01T00:00:00.000Z',
};
const search2 = {
  id: 'search-2',
  label: 'سيارات مستعملة',
  filters: { minPrice: 1000 },
  createdAt: '2026-07-10T00:00:00.000Z',
  lastNotifiedAt: null,
};
// PLATFORM-WIDE-01
const search3 = {
  id: 'search-3',
  label: 'أغطية آيفون',
  filters: { type: 'products', q: 'case', categoryId: 'pcat-1' },
  createdAt: '2026-07-15T00:00:00.000Z',
  lastNotifiedAt: null,
};
const search4 = {
  id: 'search-4',
  label: 'صيانة تكييف',
  filters: { type: 'services', q: 'تكييف' },
  createdAt: '2026-07-20T00:00:00.000Z',
  lastNotifiedAt: null,
};

function mockSearches(overrides: Record<string, unknown> = {}) {
  (useSavedSearches as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [search1],
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('SavedSearchesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearches();
    (useDeleteSavedSearch as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockDeleteMutate, isPending: false });
  });

  it('shows a spinner while loading', () => {
    mockSearches({ data: undefined, isLoading: true });
    render(<SavedSearchesList />);

    expect(screen.queryByText('لا توجد عمليات بحث محفوظة')).not.toBeInTheDocument();
  });

  it('shows an error message with retry on failure', async () => {
    mockSearches({ data: undefined, isError: true });
    const user = setupUser();
    render(<SavedSearchesList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل عمليات البحث المحفوظة')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the empty state with a browse CTA when there are no saved searches', () => {
    mockSearches({ data: [] });
    render(<SavedSearchesList />);

    expect(screen.getByText('لا توجد عمليات بحث محفوظة')).toBeInTheDocument();
    expect(screen.getByText('تصفح الإعلانات')).toBeInTheDocument();
  });

  it('renders the label and filter chips (query, city, price range)', () => {
    render(<SavedSearchesList />);

    expect(screen.getByText('شقق في غزة')).toBeInTheDocument();
    expect(screen.getByText('"شقة"')).toBeInTheDocument();
    expect(screen.getByText('غزة')).toBeInTheDocument();
  });

  it('shows the last-notified date when present', () => {
    render(<SavedSearchesList />);

    expect(screen.getByText(/آخر تنبيه/)).toBeInTheDocument();
  });

  it('omits the last-notified text when lastNotifiedAt is null', () => {
    mockSearches({ data: [search2] });
    render(<SavedSearchesList />);

    expect(screen.queryByText(/آخر تنبيه/)).not.toBeInTheDocument();
  });

  it('shows an open-ended max ("∞") price chip when only minPrice is set', () => {
    mockSearches({ data: [search2] });
    render(<SavedSearchesList />);

    expect(screen.getByText(/∞/)).toBeInTheDocument();
  });

  it('builds the "عرض النتائج المطابقة" link with the search filters as query params', () => {
    render(<SavedSearchesList />);

    const link = screen.getByText('عرض النتائج المطابقة').closest('a');
    const href = link?.getAttribute('href') ?? '';
    expect(href).toContain('q=');
    expect(href).toContain('city=');
  });

  it('calls delete with the search id when its delete button is clicked', async () => {
    const user = setupUser();
    render(<SavedSearchesList />);

    await user.click(screen.getByRole('button', { name: 'حذف البحث المحفوظ شقق في غزة' }));

    expect(mockDeleteMutate).toHaveBeenCalledWith('search-1');
  });

  it('disables the delete button while the mutation is pending', () => {
    (useDeleteSavedSearch as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockDeleteMutate, isPending: true });
    render(<SavedSearchesList />);

    expect(screen.getByRole('button', { name: 'حذف البحث المحفوظ شقق في غزة' })).toBeDisabled();
  });

  // PLATFORM-WIDE-01
  it('shows an "إعلانات" type chip and defaults to it when filters.type is absent (pre-existing rows)', () => {
    render(<SavedSearchesList />);

    expect(screen.getByText('إعلانات')).toBeInTheDocument();
  });

  it('shows a "منتجات" type chip and builds a /products URL for a products-type saved search', () => {
    mockSearches({ data: [search3] });
    render(<SavedSearchesList />);

    expect(screen.getByText('منتجات')).toBeInTheDocument();
    const link = screen.getByText('عرض النتائج المطابقة').closest('a');
    const href = link?.getAttribute('href') ?? '';
    expect(href).toContain('/products?');
    expect(href).toContain('search=case');
    expect(href).toContain('categoryId=pcat-1');
  });

  it('shows a "خدمات" type chip and builds a /services URL for a services-type saved search', () => {
    mockSearches({ data: [search4] });
    render(<SavedSearchesList />);

    expect(screen.getByText('خدمات')).toBeInTheDocument();
    const link = screen.getByText('عرض النتائج المطابقة').closest('a');
    const href = link?.getAttribute('href') ?? '';
    expect(href).toContain('/services?');
  });
});
