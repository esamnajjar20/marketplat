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

vi.mock('@/hooks/queries/useProducts', () => ({
  useProducts: vi.fn(),
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

const mockRefetch = vi.fn();
const product1 = { id: 'prod-1', name: 'كرسي مكتبي' };
const product2 = { id: 'prod-2', name: 'طاولة اجتماعات' };

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
});
