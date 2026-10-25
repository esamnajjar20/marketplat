/**
 * __tests__/components/recommendations/ProductRecommendations.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductRecommendations } from '@/components/recommendations/ProductRecommendations';
import { useProductRecommendations } from '@/hooks/queries/useRecommendations';

vi.mock('@/hooks/queries/useRecommendations', () => ({
  useProductRecommendations: vi.fn(),
}));

vi.mock('@/components/stores/ProductCard', () => ({
  ProductCard: ({ product }: { product: { id: string; name: string } }) => (
    <div data-testid={`product-${product.id}`}>{product.name}</div>
  ),
}));

const mockRefetch = vi.fn();

function mockHook(overrides: Record<string, unknown> = {}) {
  (useProductRecommendations as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [{ id: 'prod-1', name: 'منتج 1', storeId: 'store-1' }],
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('ProductRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no product is being excluded (nothing highlighted)', () => {
    mockHook();
    const { container } = render(<ProductRecommendations />);
    expect(container).toBeEmptyDOMElement();
    // The hook itself gates via `enabled`; the component still calls it,
    // but disabled — asserted via the hook's own enabled test.
  });

  it('gates the hook via enabled:false when excludeProductId is absent', () => {
    mockHook();
    render(<ProductRecommendations />);
    expect(useProductRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ excludeProductId: undefined }),
      { enabled: false }
    );
  });

  it('gates the hook via enabled:true and passes excludeProductId when present', () => {
    mockHook();
    render(<ProductRecommendations excludeProductId="prod-1" />);
    expect(useProductRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ excludeProductId: 'prod-1' }),
      { enabled: true }
    );
  });

  it('renders product cards on success', () => {
    mockHook();
    render(<ProductRecommendations excludeProductId="prod-1" />);
    expect(screen.getByTestId('product-prod-1')).toHaveTextContent('منتج 1');
    expect(screen.getByText('منتجات قد تعجبك')).toBeInTheDocument();
  });

  it('renders loading skeletons', () => {
    mockHook({ data: undefined, isLoading: true });
    render(<ProductRecommendations excludeProductId="prod-1" />);
    expect(screen.getByText('منتجات قد تعجبك')).toBeInTheDocument();
  });

  it('renders the error/retry state and never breaks the parent page', () => {
    mockHook({ data: undefined, isError: true });
    render(<ProductRecommendations excludeProductId="prod-1" />);
    expect(screen.getByText('حدث خطأ أثناء تحميل التوصيات')).toBeInTheDocument();
  });

  it('renders nothing when the result is empty', () => {
    mockHook({ data: [] });
    const { container } = render(<ProductRecommendations excludeProductId="prod-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
