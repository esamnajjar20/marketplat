/**
 * __tests__/components/PromotedProductsSection.test.tsx
 *
 * Coverage targets:
 *  - queries useProducts with hasPromotion: true
 *  - loading → skeleton grid, no cards
 *  - empty (no live promotions) → renders null (no EmptyState, unlike
 *    RecentProductsSection — see the component's own doc comment)
 *  - resolved with items → heading, CTA link with ?hasPromotion=true,
 *    and one ProductCard per item
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { useProducts } from '@/hooks/queries/useProducts';

vi.mock('@/hooks/queries/useProducts', () => ({
  useProducts: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/stores/ProductCard', () => ({
  ProductCard: ({ product }: { product: { id: string; name: string } }) => (
    <div data-testid={`product-${product.id}`}>{product.name}</div>
  ),
}));

const mockProduct = {
  id: 'product-1',
  name: 'خلاط كهربائي',
  store: { id: 'store-1' },
};

describe('PromotedProductsSection', () => {
  beforeEach(() => vi.resetAllMocks());

  it('queries useProducts with hasPromotion: true', () => {
    (useProducts as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: true });
    render(<PromotedProductsSection />);

    expect(useProducts).toHaveBeenCalledWith(
      expect.objectContaining({ hasPromotion: true, limit: 8 })
    );
  });

  it('shows the heading and a skeleton grid while loading, with no product cards', () => {
    (useProducts as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: true });
    render(<PromotedProductsSection />);

    // Header is kept during loading (FIX UI-REVIEW-2) so the accent band
    // does not flash from empty → headed once data arrives.
    expect(screen.getByText('عروض مميزة')).toBeInTheDocument();
    expect(screen.queryByTestId('product-product-1')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no live promotions', () => {
    (useProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: {} }, isLoading: false,
    });
    const { container } = render(<PromotedProductsSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when data is undefined post-loading', () => {
    (useProducts as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: false });
    const { container } = render(<PromotedProductsSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the heading, CTA, and a card per item when there are live promotions', () => {
    (useProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [mockProduct], meta: {} }, isLoading: false,
    });
    render(<PromotedProductsSection />);

    expect(screen.getByText('عروض مميزة')).toBeInTheDocument();
    expect(screen.getByTestId('product-product-1')).toBeInTheDocument();
    const cta = screen.getByText('عرض الكل ←');
    expect(cta.closest('a')).toHaveAttribute('href', '/products?hasPromotion=true');
  });
});
