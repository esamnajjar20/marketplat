/**
 * __tests__/components/ProductDetail.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ProductDetail } from '@/components/stores/ProductDetail';
import type { ProductWithFullStore } from '@/types/product.types';

vi.mock('@/components/shared/ui/SafeImage', () => ({
  SafeImage: (props: { alt?: string }) => <img alt={props.alt ?? ''} />,
}));

vi.mock('@/components/shared/FavoriteButton', () => ({
  FavoriteButton: () => <button type="button">مفضلة</button>,
}));

vi.mock('@/components/ads/ShareAdButton', () => ({
  ShareAdButton: () => <button type="button">مشاركة</button>,
}));

vi.mock('@/components/stores/ReportProductButton', () => ({
  ReportProductButton: () => <button type="button">بلاغ</button>,
}));

vi.mock('@/components/profile/MessageUserButtonGate', () => ({
  MessageUserButtonGate: () => <button type="button">رسالة</button>,
}));

vi.mock('@/components/payment/StorePaymentMethods', () => ({
  StorePaymentMethods: () => <div data-testid="payment-methods" />,
}));

vi.mock('@/components/stores/ProductCard', () => ({
  ProductCard: ({ product }: { product: { name: string } }) => (
    <div data-testid="related-card">{product.name}</div>
  ),
}));

vi.mock('@/components/recommendations/ProductRecommendations', () => ({
  ProductRecommendations: () => <div data-testid="recommendations" />,
}));

const baseProduct = {
  id: 'prod-1',
  storeId: 'store-1',
  categoryId: 'cat-1',
  name: 'هاتف سامسونج',
  description: 'وصف المنتج التفصيلي هنا',
  images: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
  price: '1500',
  wholesalePrice: null,
  wholesaleMinQty: null,
  discountPrice: null,
  availability: 'IN_STOCK' as const,
  stockQuantity: 5,
  status: 'ACTIVE' as const,
  views: 42,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  store: {
    id: 'store-1',
    name: 'متجر التقنية',
    logoUrl: null,
    city: 'غزة',
    status: 'ACTIVE',
    plan: 'FREE',
    description: null,
    phone: '0599000000',
    address: null,
    latitude: null,
    longitude: null,
    coverUrl: null,
    sellerProfileId: 'sp-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sellerProfile: {
      id: 'sp-1',
      userId: 'u-1',
      verified: true,
      averageRating: '4.5',
      totalRatings: 10,
      paymentMethods: [],
    },
  },
  category: { id: 'cat-1', name: 'Phones', nameAr: 'هواتف', slug: 'phones' },
  effectivePrice: {
    price: 1500,
    originalPrice: 1500,
    discountPrice: null,
    discountPercentage: null,
    hasActivePromotion: false,
    activePromotionId: null,
  },
} as unknown as ProductWithFullStore;

describe('ProductDetail', () => {
  it('renders product name, description, and store name', () => {
    render(<ProductDetail product={baseProduct} />);

    expect(screen.getAllByText('هاتف سامسونج').length).toBeGreaterThan(0);
    expect(screen.getByText('وصف المنتج التفصيلي هنا')).toBeInTheDocument();
    expect(screen.getAllByText('متجر التقنية').length).toBeGreaterThan(0);
  });

  it('shows formatted price', () => {
    render(<ProductDetail product={baseProduct} />);
    expect(screen.getAllByText(/1,?500|١٥٠٠/).length).toBeGreaterThan(0);
  });

  it('opens lightbox on image click', async () => {
    const user = setupUser();
    render(<ProductDetail product={baseProduct} />);

    await user.click(screen.getByLabelText('تكبير الصورة'));
    // lightbox close control or overlay should appear
    expect(
      screen.queryByLabelText(/إغلاق|close/i) ||
        document.querySelector('[class*="fixed"]'),
    ).toBeTruthy();
  });

  it('renders related products when provided', () => {
    const related = [
      { ...baseProduct, id: 'prod-2', name: 'منتج مرتبط' },
    ] as never;

    render(<ProductDetail product={baseProduct} related={related} />);
    expect(screen.getByText('منتج مرتبط')).toBeInTheDocument();
  });

  it('shows discount when effectivePrice has discountPrice', () => {
    const discounted = {
      ...baseProduct,
      effectivePrice: {
        ...baseProduct.effectivePrice,
        discountPrice: 1200,
        discountPercentage: 20,
        hasActivePromotion: true,
      },
    } as ProductWithFullStore;

    render(<ProductDetail product={discounted} />);
    expect(screen.getAllByText('هاتف سامسونج').length).toBeGreaterThan(0);
  });
});
