/**
 * __tests__/components/StoreProducts.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers loading/error/empty states,
 * FIX BUG-09's namespaced `productsPage` param (must not collide with
 * StoreReviewsList's `reviewsPage` on the same store page), FIX BUG-08's
 * highlight-and-scroll behavior for a `?product=` deep link (ring
 * styling applied only to the matching card, scrollIntoView called),
 * and pagination visibility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { StoreProducts } from '@/components/stores/StoreProducts';
import { useProducts } from '@/hooks/queries/useProducts';
import { track } from '@/lib/analytics';

vi.mock('@/hooks/queries/useProducts', () => ({
  useProducts: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/ProductCard', () => ({
  ProductCard: ({ product }: { product: { id: string; name: string } }) => (
    <div data-testid={`product-${product.id}`}>{product.name}</div>
  ),
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ pageParam, totalPages }: { pageParam: string; totalPages: number }) => (
    <div data-testid="pagination">{pageParam}:{totalPages}</div>
  ),
}));

// PR4C: ProductRecommendations has its own full test coverage
// (__tests__/components/recommendations/ProductRecommendations.test.tsx)
// — mocked here so this file stays a unit test of StoreProducts's own
// logic, and so it doesn't need a QueryClientProvider wrapper just to
// satisfy the real hook underneath the real component.
vi.mock('@/components/recommendations/ProductRecommendations', () => ({
  ProductRecommendations: ({ excludeProductId }: { excludeProductId?: string }) => (
    <div data-testid="product-recommendations">{excludeProductId ?? 'none'}</div>
  ),
}));

const mockRefetch = vi.fn();
const product1 = { id: 'prod-1', name: 'كرسي مكتبي', categoryId: 'cat-1' };
const product2 = { id: 'prod-2', name: 'طاولة اجتماعات', categoryId: 'cat-2' };

function mockProducts(overrides: Record<string, unknown> = {}) {
  (useProducts as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [product1, product2], meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('StoreProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockProducts();
  });

  it('shows a spinner while loading', () => {
    mockProducts({ data: undefined, isLoading: true });
    render(<StoreProducts storeId="store-1" />);

    expect(screen.queryByText('لا توجد منتجات')).not.toBeInTheDocument();
  });

  it('shows an error message with retry on failure', async () => {
    mockProducts({ data: undefined, isError: true });
    const user = setupUser();
    render(<StoreProducts storeId="store-1" />);

    expect(screen.getByText('حدث خطأ أثناء تحميل المنتجات')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the empty state when the store has no products', () => {
    mockProducts({ data: { items: [], meta: { totalPages: 1 } } });
    render(<StoreProducts storeId="store-1" />);

    expect(screen.getByText('لا توجد منتجات')).toBeInTheDocument();
  });

  it('renders a ProductCard for each product', () => {
    render(<StoreProducts storeId="store-1" />);

    expect(screen.getByTestId('product-prod-1')).toBeInTheDocument();
    expect(screen.getByTestId('product-prod-2')).toBeInTheDocument();
  });

  it('applies a highlight ring only to the product matching ?product= (FIX BUG-08)', () => {
    mockSearchParams = new URLSearchParams('product=prod-2');
    render(<StoreProducts storeId="store-1" />);

    const wrapper = screen.getByTestId('product-prod-2').parentElement;
    expect(wrapper?.className).toMatch(/ring-primary/);

    const otherWrapper = screen.getByTestId('product-prod-1').parentElement;
    expect(otherWrapper?.className).not.toMatch(/ring-primary/);
  });

  it('reads the page number from the namespaced "productsPage" param (FIX BUG-09)', () => {
    mockSearchParams = new URLSearchParams('productsPage=2');
    render(<StoreProducts storeId="store-1" />);

    expect(useProducts).toHaveBeenCalledWith({ storeId: 'store-1', page: 2, limit: 12 });
  });

  it('does not render pagination for a single page', () => {
    render(<StoreProducts storeId="store-1" />);

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders pagination using the "productsPage" pageParam when there is more than one page', () => {
    mockProducts({ data: { items: [product1], meta: { totalPages: 3 } } });
    render(<StoreProducts storeId="store-1" />);

    expect(screen.getByTestId('pagination')).toHaveTextContent('productsPage:3');
  });

  // PR4A (recommendation view signals): the `?product=` deep link is
  // this app's only product "detail view" moment (see StoreProducts.tsx's
  // own comment — no dedicated /products/[id] route exists), so it
  // doubles as the PRODUCT_VIEW instrumentation point.
  describe('PRODUCT_VIEW tracking (PR4A)', () => {
    it('fires PRODUCT_VIEW with the highlighted product\'s id/categoryId', () => {
      mockSearchParams = new URLSearchParams('product=prod-2');
      render(<StoreProducts storeId="store-1" />);

      expect(track).toHaveBeenCalledWith('PRODUCT_VIEW', {
        productId: 'prod-2',
        categoryId: 'cat-2',
      });
      expect(track).toHaveBeenCalledTimes(1);
    });

    it('does not fire PRODUCT_VIEW when there is no ?product= param', () => {
      render(<StoreProducts storeId="store-1" />);

      expect(track).not.toHaveBeenCalled();
    });

    it('does not fire PRODUCT_VIEW when ?product= matches nothing in the loaded items', () => {
      mockSearchParams = new URLSearchParams('product=does-not-exist');
      render(<StoreProducts storeId="store-1" />);

      expect(track).not.toHaveBeenCalled();
    });

    it('does not re-fire PRODUCT_VIEW on an unrelated re-render (duplicate-render protection)', () => {
      mockSearchParams = new URLSearchParams('product=prod-2');
      const { rerender } = render(<StoreProducts storeId="store-1" />);

      expect(track).toHaveBeenCalledTimes(1);

      // Simulate a benign re-render with the same resolved product (e.g.
      // a refetch that returns an equivalent item list, or an unrelated
      // parent state change) — same dependency-array dedup AD_VIEW's
      // own effect relies on (see AdDetailSection.tsx).
      rerender(<StoreProducts storeId="store-1" />);

      expect(track).toHaveBeenCalledTimes(1);
    });

    it('fires again when the highlighted product changes to a different one', () => {
      mockSearchParams = new URLSearchParams('product=prod-1');
      const { rerender } = render(<StoreProducts storeId="store-1" />);
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenLastCalledWith('PRODUCT_VIEW', {
        productId: 'prod-1',
        categoryId: 'cat-1',
      });

      mockSearchParams = new URLSearchParams('product=prod-2');
      rerender(<StoreProducts storeId="store-1" />);

      expect(track).toHaveBeenCalledTimes(2);
      expect(track).toHaveBeenLastCalledWith('PRODUCT_VIEW', {
        productId: 'prod-2',
        categoryId: 'cat-2',
      });
    });
  });

  // PR4C: the ?product= highlight (same moment PRODUCT_VIEW fires
  // from, above) is this app's only product-recommendation attachment
  // point — see ProductRecommendations.tsx's own comment.
  describe('product recommendations (PR4C)', () => {
    it('passes no excludeProductId through when no product is highlighted', () => {
      render(<StoreProducts storeId="store-1" />);

      expect(screen.getByTestId('product-recommendations')).toHaveTextContent('none');
    });

    it('excludes the highlighted product once it resolves from ?product=', () => {
      mockSearchParams = new URLSearchParams('product=prod-2');
      render(<StoreProducts storeId="store-1" />);

      expect(screen.getByTestId('product-recommendations')).toHaveTextContent('prod-2');
    });

    it('passes no excludeProductId when ?product= matches nothing in the loaded items', () => {
      mockSearchParams = new URLSearchParams('product=does-not-exist');
      render(<StoreProducts storeId="store-1" />);

      expect(screen.getByTestId('product-recommendations')).toHaveTextContent('none');
    });
  });
});
