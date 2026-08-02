/**
 * __tests__/components/ProductCard.test.tsx
 *
 * Coverage targets:
 *  - renders name and formatted price
 *  - links to /stores/:storeId?product=:productId
 *  - discount price logic: when discountPrice is set, shows it as the
 *    primary price and the original price struck through; when null,
 *    shows only the plain price with no strikethrough
 *  - availability badge: hidden for IN_STOCK, shown with the right
 *    label for LIMITED and OUT_OF_STOCK
 *  - wholesale pricing line shown only when BOTH wholesalePrice and
 *    wholesaleMinQty are present (a partial pair must not render half
 *    a sentence)
 *  - falls back to a placeholder image when the product has no images
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductCard } from '@/components/stores/ProductCard';
import { formatPrice } from '@/lib/formatters';
import type { Product } from '@/types/product.types';

const baseProduct: Product = {
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
};

describe('ProductCard', () => {
  it('renders the product name', () => {
    render(<ProductCard product={baseProduct} storeId="store-1" />);
    expect(screen.getByText('خلاط كهربائي 500 واط')).toBeInTheDocument();
  });

  it('links to the parent store page with the product id as a query param', () => {
    render(<ProductCard product={baseProduct} storeId="store-1" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/stores/store-1?product=prod-1');
  });

  describe('pricing', () => {
    it('shows the plain price with no strikethrough when there is no discount', () => {
      render(<ProductCard product={baseProduct} storeId="store-1" />);
      expect(screen.getByText(formatPrice('150'))).toBeInTheDocument();
      // Only one price shown — no original-price line rendered at all.
      expect(screen.getAllByText(formatPrice('150'))).toHaveLength(1);
    });

    it('shows the discount price as primary and the original price struck through', () => {
      render(<ProductCard product={{ ...baseProduct, discountPrice: '120' }} storeId="store-1" />);
      expect(screen.getByText(formatPrice('120'))).toBeInTheDocument();
      expect(screen.getByText(formatPrice('150'))).toBeInTheDocument();
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

  it('applies a custom className alongside the default styling', () => {
    render(<ProductCard product={baseProduct} storeId="store-1" className="custom-class" />);
    expect(screen.getByRole('link')).toHaveClass('custom-class');
  });
});
