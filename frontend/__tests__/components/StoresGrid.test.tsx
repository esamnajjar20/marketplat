/**
 * __tests__/components/StoresGrid.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers 's skeleton (not a
 * spinner) loading state, error+retry, the total-count summary line
 * with the quoted search-term suffix, the empty state's search-aware
 * vs generic description branch, grid rendering, and pagination.
 * Confirms filter params from the URL are all passed through to
 * useStores with correct defaults.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { StoresGrid } from '@/components/stores/StoresGrid';
import { useInfiniteQuery } from '@tanstack/react-query';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useInfiniteQuery: vi.fn() };
});

vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/StoreCard', () => ({
  StoreCard: ({ store }: { store: { id: string; name: string } }) => <div data-testid={`store-${store.id}`}>{store.name}</div>,
}));

vi.mock('@/components/shared/skeletons', () => ({
  StoreCardSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/components/shared/list/InfiniteScrollTrigger', () => ({
  InfiniteScrollTrigger: ({ hasNextPage }: { hasNextPage: boolean }) => (
    <div data-testid="infinite-scroll-trigger" data-has-next-page={String(hasNextPage)} />
  ),
}));

const mockRefetch = vi.fn();
const store = { id: 'store-1', name: 'متجر البركة' };

function mockStores(overrides: Record<string, any> = {}) {
  const hasDataOverride = Object.prototype.hasOwnProperty.call(overrides, 'data');
  const { data, ...rest } = overrides;
  const page = hasDataOverride ? data : { items: [store], meta: { totalPages: 1, total: 1 } };
  vi.mocked(useInfiniteQuery).mockReturnValue({
    data: page ? { pages: [page], pageParams: [1] } : undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: mockRefetch,
    fetchNextPage: vi.fn(),
    hasNextPage: Boolean(page && page.meta?.totalPages > 1),
    isFetchingNextPage: false,
    ...rest,
  } as never);
}

describe('StoresGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockStores();
  });

  it('renders skeleton cards (not a spinner) while loading (FIX UX-04)', () => {
    mockStores({ data: undefined, isLoading: true });
    render(<StoresGrid />);

    expect(screen.getAllByTestId('skeleton')).toHaveLength(6);
  });

  it('shows an error message with retry on failure', async () => {
    mockStores({ data: undefined, isError: true });
    const user = setupUser();
    render(<StoresGrid />);

    expect(screen.getByText('حدث خطأ أثناء تحميل المتاجر')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the total store count', () => {
    mockStores({ data: { items: [store], meta: { totalPages: 1, total: 42 } } });
    render(<StoresGrid />);

    expect(screen.getByText(/42 متجر/)).toBeInTheDocument();
  });

  it('shows "لا توجد نتائج" when total is 0', () => {
    mockStores({ data: { items: [], meta: { totalPages: 1, total: 0 } } });
    render(<StoresGrid />);

    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
  });

  it('appends the quoted search term to the summary line when searching', () => {
    mockSearchParams = new URLSearchParams('search=أثاث');
    mockStores({ data: { items: [store], meta: { totalPages: 1, total: 5 } } });
    render(<StoresGrid />);

    expect(screen.getByText('أثاث')).toBeInTheDocument();
  });

  it('renders a StoreCard for each store', () => {
    render(<StoresGrid />);

    expect(screen.getByTestId('store-store-1')).toBeInTheDocument();
  });

  it('shows the generic empty description with no active search', () => {
    mockStores({ data: { items: [], meta: { totalPages: 1, total: 0 } } });
    render(<StoresGrid />);

    expect(screen.getByText('لا توجد متاجر مطابقة لهذه الفلاتر')).toBeInTheDocument();
  });

  it('shows a search-aware empty description when a search term is active', () => {
    mockSearchParams = new URLSearchParams('search=نجارة');
    mockStores({ data: { items: [], meta: { totalPages: 1, total: 0 } } });
    render(<StoresGrid />);

    expect(screen.getByText(/لم نجد نتائج لـ "نجارة"/)).toBeInTheDocument();
  });

  it('passes URL filter params (with defaults) through the infinite-query key', () => {
    mockSearchParams = new URLSearchParams('city=غزة&sortBy=name&sortOrder=asc&page=2');
    render(<StoresGrid />);

    const queryKey = vi.mocked(useInfiniteQuery).mock.calls.at(-1)?.[0].queryKey as unknown[];
    expect(queryKey[0]).toBe('stores');
    expect(queryKey[1]).toBe('infinite');
    expect(queryKey[2]).toEqual(expect.objectContaining({ city: 'غزة', sortBy: 'name', sortOrder: 'asc' }));
  });

  it('defaults sortBy to createdAt and sortOrder to desc when absent from the URL', () => {
    render(<StoresGrid />);

    const queryKey = vi.mocked(useInfiniteQuery).mock.calls.at(-1)?.[0].queryKey as unknown[];
    expect(queryKey[2]).toEqual(expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'desc' }));
  });

  it('does not render pagination for a single page', () => {
    render(<StoresGrid />);

    expect(screen.getByTestId('infinite-scroll-trigger')).toHaveAttribute('data-has-next-page', 'false');
  });

  it('renders pagination when there is more than one page', () => {
    mockStores({ data: { items: [store], meta: { totalPages: 4, total: 40 } } });
    render(<StoresGrid />);

    expect(screen.getByTestId('infinite-scroll-trigger')).toHaveAttribute('data-has-next-page', 'true');
  });
});
