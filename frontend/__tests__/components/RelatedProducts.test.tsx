/**
 * __tests__/components/RelatedProducts.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedProducts } from '@/components/stores/RelatedProducts';

vi.mock('@/components/stores/ProductCard', () => ({
  ProductCard: ({ product }: { product: { name: string } }) => (
    <div data-testid="product-card">{product.name}</div>
  ),
}));

vi.mock('@/components/shared/skeletons', () => ({
  ProductCardSkeleton: () => <div data-testid="skeleton" />,
}));

const products = [
  {
    id: 'p1',
    name: 'منتج 1',
    storeId: 's1',
    price: '10',
    images: [],
  },
  {
    id: 'p2',
    name: 'منتج 2',
    storeId: 's1',
    price: '20',
    images: [],
  },
] as never[];

describe('RelatedProducts', () => {
  it('returns null when empty and not loading', () => {
    const { container } = render(<RelatedProducts products={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows skeletons while loading', () => {
    render(<RelatedProducts products={[]} isLoading />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.getByText('منتجات مشابهة')).toBeInTheDocument();
  });

  it('renders product cards with custom title', () => {
    render(<RelatedProducts products={products} title="منتجات ذات صلة" />);
    expect(screen.getByText('منتجات ذات صلة')).toBeInTheDocument();
    expect(screen.getAllByTestId('product-card').length).toBeGreaterThanOrEqual(2);
  });
});
