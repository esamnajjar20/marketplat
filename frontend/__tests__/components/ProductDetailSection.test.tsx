/**
 * __tests__/components/ProductDetailSection.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductDetailSection } from '@/components/stores/ProductDetailSection';
import { useProduct, useProducts } from '@/hooks/queries/useProducts';

vi.mock('@/hooks/queries/useProducts', () => ({
  useProduct: vi.fn(),
  useProducts: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
}));
vi.mock('@/components/stores/ProductDetail', () => ({
  ProductDetail: ({ product }: { product: { name: string } }) => (
    <div data-testid="product-detail">{product.name}</div>
  ),
}));
vi.mock('@/components/shared/skeletons', () => ({
  AdDetailsSkeleton: () => <div data-testid="skeleton" />,
}));
vi.mock('@/lib/errorParser', () => ({
  parseApiError: (e: { statusCode?: number } | null) => ({
    statusCode: e?.statusCode ?? 500,
    message: 'err',
  }),
}));
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

describe('ProductDetailSection', () => {
  beforeEach(() => {
    vi.mocked(useProducts).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    } as never);
  });

  it('shows skeleton while loading', () => {
    vi.mocked(useProduct).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ProductDetailSection id="p1" />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('shows not-found empty state', () => {
    vi.mocked(useProduct).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: { statusCode: 404 },
      refetch: vi.fn(),
    } as never);
    render(<ProductDetailSection id="p1" />);
    expect(screen.getByText('المنتج غير موجود')).toBeInTheDocument();
  });

  it('renders product detail when loaded', () => {
    vi.mocked(useProduct).mockReturnValue({
      data: {
        id: 'p1',
        name: 'هاتف',
        storeId: 's1',
        store: { id: 's1', name: 'متجر', slug: 'store' },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ProductDetailSection id="p1" />);
    expect(screen.getByTestId('product-detail')).toHaveTextContent('هاتف');
    expect(screen.getAllByText('هاتف').length).toBeGreaterThan(0);
  });
});
