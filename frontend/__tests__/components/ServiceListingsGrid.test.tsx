/**
 * __tests__/components/ServiceListingsGrid.test.tsx
 *
 * Previously uncovered (0%), ~95 lines. Browse-grid for /services —
 * reads filters from the URL, forwards them to useServiceListings,
 * same loading/error/empty/populated/pagination shape as SearchResults.
 *
 * Coverage targets:
 *  - Reads search/page/categoryId/city/serviceLocation/minPrice/
 *    maxPrice/sortBy/sortOrder from URL and forwards to the hook
 *  - Loading state renders skeleton cards (not a spinner)
 *  - Error state shows a retry button that calls refetch
 *  - Empty state (items.length === 0) shows EmptyState with the
 *    search-aware description
 *  - Populated state renders one ServiceListingCard per item and the
 *    total count line, with the search term echoed when present
 *  - Pagination only renders when totalPages > 1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceListingsGrid } from '@/components/services/ServiceListingsGrid';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import type { ServiceListingWithProvider } from '@/types/service.types';

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/queries/useServiceListings', () => ({
  useServiceListings: vi.fn(),
}));

vi.mock('@/components/services/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { id: string; title: string } }) => (
    <div data-testid="listing-card">{listing.title}</div>
  ),
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ totalPages, currentPage }: { totalPages: number; currentPage: number }) => (
    <div data-testid="pagination">
      صفحة {currentPage} من {totalPages}
    </div>
  ),
}));

function makeListing(overrides: Partial<ServiceListingWithProvider> = {}): ServiceListingWithProvider {
  return {
    id: 'listing-1',
    providerId: 'provider-1',
    categoryId: 'cat-1',
    title: 'خدمة تجريبية',
    description: '',
    images: [],
    pricingType: 'FIXED',
    price: '10.00',
    durationEstimate: null,
    serviceLocation: 'AT_CUSTOMER',
    status: 'ACTIVE',
    views: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    provider: {
      id: 'provider-1',
      businessName: 'مزود',
      logoUrl: null,
      availabilityStatus: 'AVAILABLE',
      sellerProfile: { userId: 'u1', displayName: 'x', verified: false, averageRating: null },
    },
    ...overrides,
  } as ServiceListingWithProvider;
}

function mockListingsState(overrides: Partial<ReturnType<typeof useServiceListings>>) {
  vi.mocked(useServiceListings).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never);
}

vi.mock('@/components/ads/SaveSearchButton', () => ({
  SaveSearchButton: () => null,
}));

describe('ServiceListingsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('shows skeleton placeholder cards while loading, not the result cards', () => {
    mockListingsState({ isLoading: true });
    const { container } = render(<ServiceListingsGrid />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('listing-card')).not.toBeInTheDocument();
  });

  it('shows an error message with a working retry button', async () => {
    const refetch = vi.fn();
    mockListingsState({ isError: true, refetch });
    render(<ServiceListingsGrid />);
    expect(screen.getByText('حدث خطأ أثناء تحميل الخدمات')).toBeInTheDocument();
    screen.getByText('إعادة المحاولة').click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no items', () => {
    mockListingsState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<ServiceListingsGrid />);
    expect(screen.getByText('لا توجد خدمات')).toBeInTheDocument();
    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
  });

  it('shows a search-aware empty description when a search term is present', () => {
    mockSearchParams = new URLSearchParams({ search: 'سباك' });
    mockListingsState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<ServiceListingsGrid />);
    expect(screen.getByText('لم نجد نتائج لـ "سباك"')).toBeInTheDocument();
  });

  it('renders one card per item and the total count', () => {
    mockListingsState({
      data: {
        items: [makeListing({ id: 'l1', title: 'خدمة أولى' }), makeListing({ id: 'l2', title: 'خدمة ثانية' })],
        meta: { total: 2, totalPages: 1 },
      },
    });
    render(<ServiceListingsGrid />);
    expect(screen.getAllByTestId('listing-card')).toHaveLength(2);
    expect(screen.getByText('2 خدمة')).toBeInTheDocument();
  });

  it('echoes the search term in the results count line when present', () => {
    mockSearchParams = new URLSearchParams({ search: 'تنظيف' });
    mockListingsState({
      data: { items: [makeListing()], meta: { total: 1, totalPages: 1 } },
    });
    render(<ServiceListingsGrid />);
    expect(screen.getByText('تنظيف')).toBeInTheDocument();
  });

  it('does not render pagination when totalPages is 1', () => {
    mockListingsState({ data: { items: [makeListing()], meta: { total: 1, totalPages: 1 } } });
    render(<ServiceListingsGrid />);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders pagination when totalPages > 1', () => {
    mockListingsState({ data: { items: [makeListing()], meta: { total: 20, totalPages: 3 } } });
    render(<ServiceListingsGrid />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });

  it('forwards URL params to useServiceListings', () => {
    mockSearchParams = new URLSearchParams({
      search: 'كهربائي',
      page: '2',
      categoryId: 'cat-5',
      city: 'غزة',
      serviceLocation: 'REMOTE',
      minPrice: '50',
      maxPrice: '300',
      sortBy: 'price',
      sortOrder: 'asc',
    });
    mockListingsState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<ServiceListingsGrid />);
    expect(useServiceListings).toHaveBeenCalledWith({
      search: 'كهربائي',
      page: 2,
      categoryId: 'cat-5',
      city: 'غزة',
      serviceLocation: 'REMOTE',
      minPrice: 50,
      maxPrice: 300,
      sortBy: 'price',
      sortOrder: 'asc',
    });
  });

  it('defaults page to 1, sortBy to createdAt, sortOrder to desc when absent', () => {
    mockListingsState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<ServiceListingsGrid />);
    expect(useServiceListings).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, sortBy: 'createdAt', sortOrder: 'desc' })
    );
  });
});
