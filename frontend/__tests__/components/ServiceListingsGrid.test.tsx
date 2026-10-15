/**
 * ServiceListingsGrid — tests the current infinite-query contract rather than
 * the retired useServiceListings/page-number Pagination API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen, fireEvent } from '@testing-library/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ServiceListingsGrid } from '@/components/services/ServiceListingsGrid';
import type { ServiceListingWithProvider } from '@/types/service.types';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useInfiniteQuery: vi.fn() };
});
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));
vi.mock('@/hooks/useNetworkPolicy', () => ({
  useNetworkPolicy: () => ({ tier: 'unknown', quality: 'unknown', saveData: false, effectiveType: null, downlinkMbps: null, rttMs: null, consecutiveFailures: 0, allowPrefetch: true, allowBackgroundWarming: true, allowBackgroundSync: true, allowOriginalImages: false, pageSizeMultiplier: 0.8, maxPrefetchDistancePx: 500, maxPrefetchConcurrency: 1, queueConcurrency: 1, uploadConcurrency: 1, uploadTimeoutMs: 35000, uploadRetryDelaysMs: [2000], requestTimeoutMs: 18000 }),
}));
vi.mock('@/components/services/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { id: string; title: string } }) => <div data-testid="listing-card">{listing.title}</div>,
}));
vi.mock('@/components/ads/SaveSearchButton', () => ({ SaveSearchButton: () => null }));
vi.mock('@/components/shared/list/ListViewToggle', () => ({ ListViewToggle: () => null }));

function makeListing(overrides: Partial<ServiceListingWithProvider> = {}): ServiceListingWithProvider {
  return {
    id: 'listing-1', providerId: 'provider-1', categoryId: 'cat-1', title: 'خدمة تجريبية',
    description: '', images: [], pricingType: 'FIXED', price: '10.00', durationEstimate: null,
    serviceLocation: 'AT_CUSTOMER', status: 'ACTIVE', views: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    provider: { id: 'provider-1', businessName: 'مزود', logoUrl: null, availabilityStatus: 'AVAILABLE', sellerProfile: { userId: 'u1', displayName: 'x', verified: false, averageRating: null } },
    ...overrides,
  } as ServiceListingWithProvider;
}

type QueryState = {
  data?: { pages: Array<{ items: ServiceListingWithProvider[]; meta: { total: number; page: number; hasNextPage: boolean } }> };
  isLoading?: boolean; isFetching?: boolean; isError?: boolean; hasNextPage?: boolean;
  isFetchingNextPage?: boolean; refetch?: ReturnType<typeof vi.fn>; fetchNextPage?: ReturnType<typeof vi.fn>;
};
function mockQueryState(overrides: QueryState = {}) {
  const { hasNextPage, ...rest } = overrides;
  vi.mocked(useInfiniteQuery).mockReturnValue({
    data: undefined, isLoading: false, isFetching: false, isError: false,
    refetch: vi.fn(), fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
    ...rest,
    ...(hasNextPage !== undefined ? { hasNextPage } : {}),
  } as never);
}
function page(items: ServiceListingWithProvider[] = [], total = items.length, hasNextPage = false) {
  return { pages: [{ items, meta: { total, page: 1, hasNextPage } }] };
}

describe('ServiceListingsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockQueryState();
  });

  it('shows skeleton placeholder cards while loading', () => {
    mockQueryState({ isLoading: true });
    const { container } = render(<ServiceListingsGrid />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('listing-card')).not.toBeInTheDocument();
  });

  it('shows an error message and retry action', () => {
    const refetch = vi.fn();
    mockQueryState({ isError: true, refetch });
    render(<ServiceListingsGrid />);
    expect(screen.getByText('حدث خطأ أثناء تحميل الخدمات')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when the first page has no items', () => {
    mockQueryState({ data: page([], 0) });
    render(<ServiceListingsGrid />);
    expect(screen.getByText('لا توجد خدمات')).toBeInTheDocument();
    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
  });

  it('shows a search-aware empty description', () => {
    mockSearchParams = new URLSearchParams({ search: 'سباك' });
    mockQueryState({ data: page([], 0) });
    render(<ServiceListingsGrid />);
    expect(screen.getByText('لم نجد نتائج لـ "سباك"')).toBeInTheDocument();
  });

  it('renders cards from all returned pages and the total count', () => {
    mockQueryState({ data: { pages: [
      { items: [makeListing({ id: 'l1', title: 'خدمة أولى' })], meta: { total: 2, page: 1, hasNextPage: true } },
      { items: [makeListing({ id: 'l2', title: 'خدمة ثانية' })], meta: { total: 2, page: 2, hasNextPage: false } },
    ] } });
    render(<ServiceListingsGrid />);
    expect(screen.getAllByTestId('listing-card')).toHaveLength(2);
    expect(screen.getByText('2 خدمة')).toBeInTheDocument();
  });

  it('echoes the search term in the result summary', () => {
    mockSearchParams = new URLSearchParams({ search: 'تنظيف' });
    mockQueryState({ data: page([makeListing()], 1) });
    render(<ServiceListingsGrid />);
    expect(screen.getByText(/بحثاً عن/)).toHaveTextContent('تنظيف');
  });

  it('offers an explicit load-more action when another page exists', () => {
    const fetchNextPage = vi.fn();
    mockQueryState({ data: page([makeListing()], 20, true), hasNextPage: true, fetchNextPage });
    render(<ServiceListingsGrid />);
    fireEvent.click(screen.getByRole('button', { name: 'تحميل المزيد' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('builds its infinite query key from the current URL filters', () => {
    mockSearchParams = new URLSearchParams('search=كهربائي&categoryId=cat-5&city=غزة&serviceLocation=REMOTE&minPrice=50&maxPrice=300&sortBy=price&sortOrder=asc');
    mockQueryState({ data: page([], 0) });
    render(<ServiceListingsGrid />);
    const options = vi.mocked(useInfiniteQuery).mock.calls.at(-1)?.[0] as { queryKey?: unknown } | undefined;
    expect(JSON.stringify(options?.queryKey)).toContain('كهربائي');
    expect(JSON.stringify(options?.queryKey)).toContain('cat-5');
    expect(JSON.stringify(options?.queryKey)).toContain('REMOTE');
    expect(JSON.stringify(options?.queryKey)).toContain('300');
  });
});
