/**
 * ProductsGrid contract tests. The component uses useInfiniteQuery directly;
 * keep its query state deterministic and assert the actual API query function.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ProductsGrid } from '@/components/stores/ProductsGrid';
import { productsApi } from '@/api/products.api';

const { mockUseInfiniteQuery } = vi.hoisted(() => ({ mockUseInfiniteQuery: vi.fn() }));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useInfiniteQuery: mockUseInfiniteQuery };
});

vi.mock('@/api/products.api', () => ({ productsApi: { getAll: vi.fn() } }));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/ProductCard', () => ({
  ProductCard: ({ product, storeId }: { product: { id: string; name: string }; storeId: string }) => (
    <div data-testid={`product-${product.id}`} data-store-id={storeId}>{product.name}</div>
  ),
}));
vi.mock('@/components/shared/skeletons', () => ({ ProductCardSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/shared/ui/Pagination', () => ({ Pagination: ({ totalPages }: { totalPages: number }) => <div data-testid="pagination">pages:{totalPages}</div> }));
vi.mock('@/components/ads/SaveSearchButton', () => ({ SaveSearchButton: () => null }));

const mockRefetch = vi.fn();
const mockFetchNextPage = vi.fn();
const product = { id: 'product-1', name: 'غطاء آيفون', storeId: 'store-1', store: { id: 'store-1', name: 'متجر الاختبار' } };
const page = (items = [product], meta = { totalPages: 1, total: items.length, page: 1, hasNextPage: false }) => ({ items, meta });

function mockQuery(overrides: Record<string, unknown> = {}) {
  mockUseInfiniteQuery.mockReturnValue({
    data: { pages: [page()] },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: mockRefetch,
    fetchNextPage: mockFetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  });
}

function latestQueryOptions(): { queryKey: unknown; queryFn: (ctx: { pageParam: number; signal: AbortSignal }) => Promise<unknown> } {
  return mockUseInfiniteQuery.mock.calls.at(-1)?.[0];
}

async function invokeQuery() {
  const options = latestQueryOptions();
  await options.queryFn({ pageParam: 1, signal: new AbortController().signal });
}

describe('ProductsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    vi.mocked(productsApi.getAll).mockResolvedValue({ data: { data: page() } } as never);
    mockQuery();
  });

  it('renders skeleton cards while loading', () => {
    mockQuery({ data: undefined, isLoading: true });
    render(<ProductsGrid />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(12);
  });

  it('shows an error message with retry on failure', async () => {
    mockQuery({ data: undefined, isError: true });
    const user = setupUser();
    render(<ProductsGrid />);
    expect(screen.getByText('حدث خطأ أثناء تحميل المنتجات')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the total product count', () => {
    mockQuery({ data: { pages: [page([product], { totalPages: 1, total: 42, page: 1, hasNextPage: false })] } });
    render(<ProductsGrid />);
    expect(screen.getByText(/42 منتج/)).toBeInTheDocument();
  });

  it('shows the empty state when total is zero', () => {
    mockQuery({ data: { pages: [page([], { totalPages: 1, total: 0, page: 1, hasNextPage: false })] } });
    render(<ProductsGrid />);
    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
    expect(screen.getByText('لا توجد منتجات مطابقة لهذه الفلاتر')).toBeInTheDocument();
  });

  it('appends the search term to the summary when searching', () => {
    mockSearchParams = new URLSearchParams('search=غطاء');
    mockQuery({ data: { pages: [page([product], { totalPages: 1, total: 5, page: 1, hasNextPage: false })] } });
    render(<ProductsGrid />);
    expect(screen.getByText('غطاء')).toBeInTheDocument();
  });

  it('renders each product and passes through storeId', () => {
    render(<ProductsGrid />);
    const card = screen.getByTestId('product-product-1');
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('data-store-id', 'store-1');
  });

  it('shows a search-aware empty description', () => {
    mockSearchParams = new URLSearchParams('search=سماعات');
    mockQuery({ data: { pages: [page([], { totalPages: 1, total: 0, page: 1, hasNextPage: false })] } });
    render(<ProductsGrid />);
    expect(screen.getByText('لم نجد نتائج لـ "سماعات"')).toBeInTheDocument();
  });

  it('passes URL filters and defaults to the products API query function', async () => {
    mockSearchParams = new URLSearchParams('city=غزة&search=خلاط&sortBy=price&sortOrder=asc&hasPromotion=true');
    render(<ProductsGrid />);
    await invokeQuery();
    expect(productsApi.getAll).toHaveBeenCalledWith(expect.objectContaining({
      search: 'خلاط', city: 'غزة', sortBy: 'price', sortOrder: 'asc', hasPromotion: true, page: 1, limit: expect.any(Number),
    }));
  });

  it('defaults sort and promotion filters when URL values are absent or invalid', async () => {
    mockSearchParams = new URLSearchParams('hasPromotion=false');
    render(<ProductsGrid />);
    await invokeQuery();
    expect(productsApi.getAll).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'desc', hasPromotion: undefined }));
  });

  it('does not render the infinite-scroll trigger when there is no next page', () => {
    render(<ProductsGrid />);
    expect(screen.getByText('تم عرض كل النتائج')).toBeInTheDocument();
  });

  it('renders the infinite-scroll trigger when another page exists', () => {
    mockQuery({
      data: { pages: [page([product], { totalPages: 4, total: 40, page: 1, hasNextPage: true })] },
      hasNextPage: true,
    });
    render(<ProductsGrid />);
    expect(screen.getByRole('button', { name: 'تحميل المزيد' })).toBeInTheDocument();
  });
});
