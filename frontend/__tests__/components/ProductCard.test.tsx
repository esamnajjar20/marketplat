/**
 * __tests__/components/ProductCard.test.tsx
 *
 * Coverage targets:
 *  - renders name and formatted price
 *  - links to /stores/:storeId?product=:productId
 *  - PROMO-1: pricing is read from product.effectivePrice, not the raw
 *    discountPrice field — when effectivePrice.discountPrice is set,
 *    shows it as the primary price and the original price struck
 *    through; when null, shows only the plain price with no
 *    strikethrough
 *  - PROMO-1: the 🔥 discount-percentage badge shows only when
 *    hasActivePromotion is true (a live Promotion), not merely because
 *    a discountPrice happens to be set (the static fallback case)
 *  - availability badge: hidden for IN_STOCK, shown with the right
 *    label for LIMITED and OUT_OF_STOCK
 *  - wholesale pricing line shown only when BOTH wholesalePrice and
 *    wholesaleMinQty are present (a partial pair must not render half
 *    a sentence)
 *  - falls back to a placeholder image when the product has no images
  - unified 4:3 image ratio and compact metadata chips
 *
 *  FEAT-FAVORITE-POLYMORPHIC PR3: ProductCard now also renders a
 *  FavoriteButton. Mocked out (own behavior covered by
 *  FavoriteButton.test.tsx/useFavorites.test.tsx) so these tests stay
 *  focused on ProductCard's own rendering logic and don't need a
 *  QueryClientProvider wrapper.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { ProductCard } from '@/components/stores/ProductCard';
import { formatPrice } from '@/lib/formatters';
import type { ProductWithStore, EffectivePrice } from '@/types/product.types';

vi.mock('@/components/shared/FavoriteButton', () => ({
  FavoriteButton: ({ returnTo }: { returnTo?: string }) => <div data-testid="favorite-button" data-return-to={returnTo} />,
}));

const noDiscount: EffectivePrice = {
  price: 150,
  originalPrice: 150,
  discountPrice: null,
  discountPercentage: null,
  hasActivePromotion: false,
  activePromotionId: null,
};

const baseProduct: ProductWithStore = {
  id: 'prod-1',
  storeId: 'store-1',
  categoryId: 'cat-1',
  name: 'خلاط كهربائي 500 واط',
  description: 'خلاط قوي مناسب للاستخدام المنزلي اليومي',
  images: ['https://res.cloudinary.com/demo/image/upload/blender.jpg'],
  price: '150',
  wholesalePrice: null,
  wholesaleMinQty: null,
  discountPrice: null,
  availability: 'IN_STOCK',
  status: 'ACTIVE',
  views: 20,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  store: { id: 'store-1', name: 'متجر تجريبي', logoUrl: null, city: 'غزة', status: 'ACTIVE' },
  effectivePrice: noDiscount,
};

describe('ProductCard', () => {
  it('renders the product name', () => {
    render(<ProductCard product={baseProduct} storeId="store-1" />);
    expect(screen.getByText('خلاط كهربائي 500 واط')).toBeInTheDocument();
  });

  it('links to the product detail page', () => {
    render(<ProductCard product={baseProduct} storeId="store-1" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/products/prod-1');
  });

  it('returns to the selected product after signing in from its favorite action', () => {
    render(<ProductCard product={baseProduct} storeId="store-1" />);
    expect(screen.getByTestId('favorite-button')).toHaveAttribute('data-return-to', '/products/prod-1');
  });

  it('uses the unified 4:3 image frame and compact metadata chips', () => {
    render(<ProductCard product={baseProduct} storeId="store-1" />);
    const image = screen.getByRole('img', { name: baseProduct.name });
    expect(image.parentElement).toHaveClass('aspect-[4/3]');
    expect(screen.getByText('غزة').parentElement).toHaveClass('inline-flex', 'rounded-full');
  });

  describe('pricing', () => {
    it('shows the plain price with no strikethrough when there is no discount', () => {
      render(<ProductCard product={baseProduct} storeId="store-1" />);
      expect(screen.getByText(formatPrice('150'))).toBeInTheDocument();
      expect(screen.getAllByText(formatPrice('150'))).toHaveLength(1);
    });

    it('shows the static discountPrice fallback as the single displayed price', () => {
      const product: ProductWithStore = {
        ...baseProduct,
        effectivePrice: {
          price: 150,
          originalPrice: 150,
          discountPrice: 120,
          discountPercentage: 20,
          hasActivePromotion: false,
          activePromotionId: null,
        },
      };
      render(<ProductCard product={product} storeId="store-1" />);
      expect(screen.getByText(formatPrice(120))).toBeInTheDocument();
      // Original price remains visible as a line-through reference
      expect(screen.getByText(formatPrice('150'))).toBeInTheDocument();
      expect(screen.queryByText(/🔥/)).not.toBeInTheDocument();
    });

    it('shows a live promotion price with the discount badge', () => {
      const product: ProductWithStore = {
        ...baseProduct,
        effectivePrice: {
          price: 150,
          originalPrice: 150,
          discountPrice: 127.5,
          discountPercentage: 15,
          hasActivePromotion: true,
          activePromotionId: 'promo-1',
        },
      };
      render(<ProductCard product={product} storeId="store-1" />);
      expect(screen.getByText(formatPrice(127.5))).toBeInTheDocument();
      expect(screen.getByText(formatPrice('150'))).toBeInTheDocument();
      expect(screen.getByText('خصم 15%')).toBeInTheDocument();
    });
  });

  describe('availability badge', () => {
    it('shows no badge for IN_STOCK', () => {
      render(<ProductCard product={{ ...baseProduct, availability: 'IN_STOCK' }} storeId="store-1" />);
      expect(screen.queryByText('متوفر')).not.toBeInTheDocument();
      expect(screen.queryByText('كمية محدودة')).not.toBeInTheDocument();
      expect(screen.queryByText('غير متوفر')).not.toBeInTheDocument();
    });

    it('shows "كمية محدودة" for LIMITED', () => {
      render(<ProductCard product={{ ...baseProduct, availability: 'LIMITED' }} storeId="store-1" />);
      expect(screen.getByText('كمية محدودة')).toBeInTheDocument();
    });

    it('shows "غير متوفر" for OUT_OF_STOCK', () => {
      render(<ProductCard product={{ ...baseProduct, availability: 'OUT_OF_STOCK' }} storeId="store-1" />);
      expect(screen.getByText('غير متوفر')).toBeInTheDocument();
    });

    it('makes out-of-stock state unmistakable on the image as well as in the badge', () => {
      render(<ProductCard product={{ ...baseProduct, availability: 'OUT_OF_STOCK' }} storeId="store-1" />);
      expect(screen.getByLabelText('المنتج غير متوفر')).toBeInTheDocument();
    });
  });

  describe('wholesale pricing', () => {
    it('shows the wholesale line when both wholesalePrice and wholesaleMinQty are set', () => {
      render(<ProductCard
        product={{ ...baseProduct, wholesalePrice: '100', wholesaleMinQty: 10 }}
        storeId="store-1"
      />);
      expect(screen.getByText(`${formatPrice('100')} عند شراء 10+`)).toBeInTheDocument();
    });

    it('does not show the wholesale line when only wholesalePrice is set', () => {
      render(<ProductCard
        product={{ ...baseProduct, wholesalePrice: '100', wholesaleMinQty: null }}
        storeId="store-1"
      />);
      expect(screen.queryByText(/عند شراء/)).not.toBeInTheDocument();
    });

    it('does not show the wholesale line when only wholesaleMinQty is set', () => {
      render(<ProductCard
        product={{ ...baseProduct, wholesalePrice: null, wholesaleMinQty: 10 }}
        storeId="store-1"
      />);
      expect(screen.queryByText(/عند شراء/)).not.toBeInTheDocument();
    });

    it('does not show the wholesale line when neither is set', () => {
      render(<ProductCard product={baseProduct} storeId="store-1" />);
      expect(screen.queryByText(/عند شراء/)).not.toBeInTheDocument();
    });
  });

  it('renders a placeholder image when the product has no images', () => {
    render(<ProductCard product={{ ...baseProduct, images: [] }} storeId="store-1" />);
    const img = screen.getByAltText('خلاط كهربائي 500 واط');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBeTruthy();
  });

  it('keeps long product names available to users when the visible title is clamped', () => {
    const longName = 'خلاط كهربائي منزلي قوي متعدد الاستخدامات مع ضمان وخيارات إضافية';
    render(<ProductCard product={{ ...baseProduct, name: longName }} storeId="store-1" />);
    expect(screen.getByRole('heading', { name: longName })).toHaveAttribute('title', longName);
  });

  it('applies a custom className alongside the default styling', () => {
    render(<ProductCard product={baseProduct} storeId="store-1" className="custom-class" />);
    expect(screen.getByRole('link')).toHaveClass('custom-class');
  });

  describe('showKind (mixed lists)', () => {
    it('renders the "منتج" chip only when showKind is set', () => {
      const { rerender } = render(<ProductCard product={baseProduct} storeId="store-1" />);
      expect(screen.queryByText('منتج')).not.toBeInTheDocument();
      rerender(<ProductCard product={baseProduct} storeId="store-1" showKind />);
      expect(screen.getByText('منتج')).toBeInTheDocument();
    });

    it('no longer renders the redundant static "متجر" chip in the footer', () => {
      render(<ProductCard product={baseProduct} storeId="store-1" />);
      expect(screen.queryByText('متجر تجريبي')).not.toBeInTheDocument();
    });
  });

  describe('context rendering', () => {
    it('hides store, city and time inside a store context', () => {
      render(<ProductCard product={baseProduct} context="store" />);
      expect(screen.queryByText('متجر تجريبي')).not.toBeInTheDocument();
      expect(screen.queryByText('غزة')).not.toBeInTheDocument();
    });

    it('shows store and city in favorites context', () => {
      render(<ProductCard product={baseProduct} context="favorites" />);
      expect(screen.getByText('متجر تجريبي')).toBeInTheDocument();
      expect(screen.getByText('غزة')).toBeInTheDocument();
    });
  });
});
