/**
 * __tests__/components/StoreCard.test.tsx
 *
 * Coverage targets:
 *  - renders name, description, city
 *  - links to the store detail page
 *  - shows the "featured" (Sparkles) indicator only for plan: FEATURED
 *  - shows the "verified" (BadgeCheck) indicator only when the seller
 *    profile is verified
 *  - shows the rating only when totalRatings > 0 (a store with zero
 *    ratings must not show "0.0 (0)")
 *  - falls back to a placeholder image when logoUrl is null (no crash)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoreCard } from '@/components/stores/StoreCard';
import { ROUTES } from '@/lib/constants';
import type { StoreWithSeller } from '@/types/store.types';

const baseStore: StoreWithSeller = {
  id: 'store-1',
  sellerProfileId: 'sp-1',
  name: 'متجر أبو محمد',
  description: 'متجر للأدوات المنزلية وكل ما يلزم البيت',
  logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.jpg',
  coverImageUrl: null,
  city: 'غزة',
  address: null,
  phone: '0599123456',
  status: 'ACTIVE',
  plan: 'FREE',
  latitude: null,
  longitude: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sellerProfile: {
    id: 'sp-1', userId: 'u-1', displayName: 'أبو محمد', bio: null, avatarUrl: null,
    verified: false, verificationStatus: 'UNVERIFIED', verifiedAt: null, trustScore: 0,
    averageRating: '4.5', totalRatings: 12, totalAds: 0, activeAds: 0, totalSales: 0,
    responseRate: null, responseTimeMinutes: null,
    joinedSellingAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

describe('StoreCard', () => {
  it('renders the store name, description, and city', () => {
    render(<StoreCard store={baseStore} />);
    expect(screen.getByText('متجر أبو محمد')).toBeInTheDocument();
    expect(screen.getByText('متجر للأدوات المنزلية وكل ما يلزم البيت')).toBeInTheDocument();
    expect(screen.getByText('غزة')).toBeInTheDocument();
  });

  it('links to the store detail page', () => {
    render(<StoreCard store={baseStore} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', ROUTES.storeDetail('store-1'));
  });

  it('shows the rating and review count when totalRatings > 0', () => {
    render(<StoreCard store={baseStore} />);
    expect(screen.getByText('4.5 (12)')).toBeInTheDocument();
  });

  it('does not show a rating when totalRatings is 0', () => {
    render(<StoreCard store={{
      ...baseStore,
      sellerProfile: { ...baseStore.sellerProfile, totalRatings: 0, averageRating: '0' },
    }} />);
    expect(screen.queryByText(/\(0\)/)).not.toBeInTheDocument();
  });

  describe('featured indicator', () => {
    it('shows the featured icon for a FEATURED-plan store', () => {
      render(<StoreCard store={{ ...baseStore, plan: 'FEATURED' }} />);
      expect(screen.getByLabelText('متجر مميز')).toBeInTheDocument();
    });

    it('does not show the featured icon for a FREE-plan store', () => {
      render(<StoreCard store={{ ...baseStore, plan: 'FREE' }} />);
      expect(screen.queryByLabelText('متجر مميز')).not.toBeInTheDocument();
    });
  });

  describe('verified indicator', () => {
    it('shows the verified badge when the seller is verified', () => {
      render(<StoreCard store={{
        ...baseStore,
        sellerProfile: { ...baseStore.sellerProfile, verified: true },
      }} />);
      expect(screen.getByLabelText('بائع موثّق')).toBeInTheDocument();
    });

    it('does not show the verified badge when the seller is not verified', () => {
      render(<StoreCard store={{
        ...baseStore,
        sellerProfile: { ...baseStore.sellerProfile, verified: false },
      }} />);
      expect(screen.queryByLabelText('بائع موثّق')).not.toBeInTheDocument();
    });
  });

  it('renders an image with the store name as alt text even when logoUrl is null', () => {
    render(<StoreCard store={{ ...baseStore, logoUrl: null }} />);
    const img = screen.getByAltText('متجر أبو محمد');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBeTruthy();
  });

  it('applies a custom className alongside the default styling', () => {
    render(<StoreCard store={baseStore} className="custom-class" />);
    expect(screen.getByRole('link')).toHaveClass('custom-class');
  });
});
