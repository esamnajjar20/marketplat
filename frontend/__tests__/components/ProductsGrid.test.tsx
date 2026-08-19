/**
 * __tests__/components/ProductsGrid.test.tsx
 *
 * Mirrors StoresGrid.test.tsx: skeleton loading state, error+retry,
 * total-count summary with quoted search-term suffix, search-aware
 * vs generic empty description, grid rendering (with storeId passed
 * through to ProductCard), and pagination. Confirms filter params
 * from the URL are passed through to useProducts with correct
 * defaults.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ProductsGrid } from '@/components/stores/ProductsGrid';
import { useProducts } from '@/hooks/queries/useProducts';

vi.mock('@/hooks/queries/useProducts', () => ({
  useProducts: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/ProductCard', () => ({
  ProductCard: ({ product, storeId }: { product: { id: string; name: string }; storeId: string }) => (
    <div data-testid={`product-${product.id}`} data-store-id={storeId}>{product.name}</div>
  ),
}));

vi.mock('@/components/shared/skeletons', () => ({
  ProductCardSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ totalPages }: { totalPages: number }) => <div data-testid="pagination">pages:{totalPages}</div>,
}));

const mockRefetch = vi.fn();
const product = { id: 'product-1', name: 'غطاء آيفون', storeId: 'store-1' };

function mockProducts(overrides: Record<string, unknown> = {}) {
  (useProducts as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [product], meta: { totalPages: 1, total: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('ProductsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockProducts();
  });

  it('renders skeleton cards while loading', () => {
    mockProducts({ data: undefined, isLoading: true });
    render(<ProductsGrid />);

    expect(screen.getAllByTestId('skeleton')).toHaveLength(8);
  });

  it('shows an error message with retry on failure', async () => {
    mockProducts({ data: undefined, isError: true });
    const user = setupUser();
    render(<ProductsGrid />);

    expect(screen.getByText('حدث خطأ أثناء تحميل المنتجات')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the total product count', () => {
    mockProducts({ data: { items: [product], meta: { totalPages: 1, total: 42 } } });
    render(<ProductsGrid />);

    expect(screen.getByText(/42 منتج/)).toBeInTheDocument();
  });

  it('shows "لا توجد نتائج" when total is 0', () => {
    mockProducts({ data: { items: [], meta: { totalPages: 1, total: 0 } } });
    render(<ProductsGrid />);

    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
  });

  it('appends the quoted search term to the summary line when searching', () => {
    mockSearchParams = new URLSearchParams('search=غطاء');
    mockProducts({ data: { items: [product], meta: { totalPages: 1, total: 5 } } });
    render(<ProductsGrid />);

    expect(screen.getByText('غطاء')).toBeInTheDocument();
  });

  it('renders a ProductCard for each product, passing storeId through', () => {
    render(<ProductsGrid />);

    const card = screen.getByTestId('product-product-1');
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('data-store-id', 'store-1');
  });

  it('shows the generic empty description with no active search', () => {
    mockProducts({ data: { items: [], meta: { totalPages: 1, total: 0 } } });
    render(<ProductsGrid />);

    expect(screen.getByText('لا توجد منتجات مطابقة لهذه الفلاتر')).toBeInTheDocument();
  });

  it('shows a search-aware empty description when a search term is active', () => {
    mockSearchParams = new URLSearchParams('search=سماعات');
    mockProducts({ data: { items: [], meta: { totalPages: 1, total: 0 } } });
    render(<ProductsGrid />);

    expect(screen.getByText(/لم نجد نتائج لـ "سماعات"/)).toBeInTheDocument();
  });

  it('passes URL filter params (with defaults) through to useProducts', () => {
    mockSearchParams = new URLSearchParams('categoryId=cat-1&sortBy=price&sortOrder=asc&page=2');
    render(<ProductsGrid />);

    expect(useProducts).toHaveBeenCalledWith({
      search: undefined,
      page: 2,
      city: undefined,
      sortBy: 'price',
      sortOrder: 'asc',
      hasPromotion: undefined,
      limit: 12,
    });
  });

  it('defaults sortBy to createdAt and sortOrder to desc when absent from the URL', () => {
    render(<ProductsGrid />);

    expect(useProducts).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'desc' }),
    );
  });

  // PROMO-1 (Phase 10): reads ?hasPromotion=true from the URL — the
  // destination PromotedProductsSection's "عرض الكل" CTA links to.
  it('reads hasPromotion=true from the URL and passes it through as a boolean', () => {
    mockSearchParams = new URLSearchParams('hasPromotion=true');
    render(<ProductsGrid />);

    expect(useProducts).toHaveBeenCalledWith(
      expect.objectContaining({ hasPromotion: true }),
    );
  });

  it('leaves hasPromotion undefined for any value other than the literal "true"', () => {
    mockSearchParams = new URLSearchParams('hasPromotion=false');
    render(<ProductsGrid />);

    expect(useProducts).toHaveBeenCalledWith(
      expect.objectContaining({ hasPromotion: undefined }),
    );
  });

  // PROMO-1 (Phase 12, full scope): closes the "combination with other
  // filters untested" gap — hasPromotion must combine with city/search/
  // sort rather than override or get dropped alongside them.
  it('combines hasPromotion with city, search, and sort in the same query', () => {
    mockSearchParams = new URLSearchParams(
      'hasPromotion=true&city=غزة&search=خلاط&sortBy=price&sortOrder=asc'
    );
    render(<ProductsGrid />);

    expect(useProducts).toHaveBeenCalledWith({
      search: 'خلاط',
      page: 1,
      city: 'غزة',
      sortBy: 'price',
      sortOrder: 'asc',
      hasPromotion: true,
      limit: 12,
    });
  });

  it('does not render pagination for a single page', () => {
    render(<ProductsGrid />);

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders pagination when there is more than one page', () => {
    mockProducts({ data: { items: [product], meta: { totalPages: 4, total: 40 } } });
    render(<ProductsGrid />);

    expect(screen.getByTestId('pagination')).toHaveTextContent('pages:4');
  });
});
