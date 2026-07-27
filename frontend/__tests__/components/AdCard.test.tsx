/**
 * __tests__/components/AdCard.test.tsx
 *
 * FIX E2E-GAP-01 (coverage gap identified in the audit): AdCard.tsx
 * had zero test coverage despite rendering in every ad grid across the
 * app (home page FeaturedAds/RecentAds, search results, category
 * pages). Covers: the sold/featured/condition badge combination logic
 * (isFeatured && !isSold specifically — a featured-but-sold ad must
 * not show "مميز"), placeholder fallback when an ad has no images,
 * and the priority/lazy-loading prop wiring.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdCard } from '@/components/ads/AdCard';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import type { AdListItem } from '@/types/ad.types';

const baseAd: AdListItem = {
  id: 'ad-1',
  title: 'سيارة تويوتا كورولا 2020',
  price: '45000',
  isNegotiable: true,
  condition: 'USED',
  city: 'خان يونس',
  images: ['https://res.cloudinary.com/demo/image/upload/car.jpg'],
  status: 'ACTIVE',
  views: 120,
  isFeatured: false,
  isPinned: false,
  userId: 'user-1',
  sellerProfileId: 'sp-1',
  categoryId: 'cat-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  user: { id: 'user-1', name: 'محمد', avatarUrl: null, city: 'خان يونس' },
  category: { id: 'cat-1', name: 'Vehicles', nameAr: 'سيارات' },
};

describe('AdCard', () => {
  it('renders the title, price, city, and views', () => {
    render(<AdCard ad={baseAd} />);

    expect(screen.getByText('سيارة تويوتا كورولا 2020')).toBeInTheDocument();
    expect(screen.getByText(formatPrice(baseAd.price), { exact: false })).toBeInTheDocument();
    expect(screen.getByText('خان يونس')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('renders a relative time string for createdAt', () => {
    render(<AdCard ad={baseAd} />);
    expect(screen.getByText(formatRelativeTime(baseAd.createdAt))).toBeInTheDocument();
  });

  it('links to the ad detail page', () => {
    render(<AdCard ad={baseAd} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', ROUTES.adDetail(baseAd.id));
  });

  it('shows the condition badge', () => {
    render(<AdCard ad={baseAd} />);
    expect(screen.getByText('مستعمل')).toBeInTheDocument();
  });

  it('does not render a condition badge when the ad has no condition', () => {
    render(<AdCard ad={{ ...baseAd, condition: null }} />);
    expect(screen.queryByText('مستعمل')).not.toBeInTheDocument();
    expect(screen.queryByText('جديد')).not.toBeInTheDocument();
  });

  describe('sold / featured badge logic', () => {
    it('shows a "تم البيع" overlay when the ad is sold', () => {
      render(<AdCard ad={{ ...baseAd, status: 'SOLD' }} />);
      expect(screen.getByText('تم البيع')).toBeInTheDocument();
    });

    it('shows a "مميز" badge when featured and not sold', () => {
      render(<AdCard ad={{ ...baseAd, isFeatured: true, status: 'ACTIVE' }} />);
      expect(screen.getByText('مميز')).toBeInTheDocument();
    });

    // The specific compound condition in the source: isFeatured && !isSold.
    it('does NOT show the "مميز" badge when the ad is both featured and sold', () => {
      render(<AdCard ad={{ ...baseAd, isFeatured: true, status: 'SOLD' }} />);
      expect(screen.queryByText('مميز')).not.toBeInTheDocument();
      // The sold overlay still takes precedence.
      expect(screen.getByText('تم البيع')).toBeInTheDocument();
    });

    it('shows neither badge for a plain active, non-featured ad', () => {
      render(<AdCard ad={baseAd} />);
      expect(screen.queryByText('مميز')).not.toBeInTheDocument();
      expect(screen.queryByText('تم البيع')).not.toBeInTheDocument();
    });
  });

  describe('image fallback', () => {
    it('uses the ad title as the image alt text', () => {
      render(<AdCard ad={baseAd} />);
      expect(screen.getByAltText('سيارة تويوتا كورولا 2020')).toBeInTheDocument();
    });

    it('renders an image even when the ad has no images (placeholder fallback)', () => {
      render(<AdCard ad={{ ...baseAd, images: [] }} />);
      // Must not crash and must still render an <img> with the ad's
      // title as alt text, backed by the SVG placeholder rather than
      // a broken/undefined src.
      const img = screen.getByAltText('سيارة تويوتا كورولا 2020');
      expect(img).toBeInTheDocument();
      expect(img.getAttribute('src')).toBeTruthy();
    });
  });

  describe('priority / lazy loading', () => {
    it('defaults to lazy loading when priority is not passed', () => {
      render(<AdCard ad={baseAd} />);
      const img = screen.getByAltText(baseAd.title);
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('does not set a loading attribute at all when priority is true (matches next/image\'s own priority/lazy contract)', () => {
      render(<AdCard ad={baseAd} priority />);
      const img = screen.getByAltText(baseAd.title);
      expect(img).not.toHaveAttribute('loading');
    });
  });

  it('applies a custom className alongside the default styling', () => {
    render(<AdCard ad={baseAd} className="custom-test-class" />);
    expect(screen.getByRole('link')).toHaveClass('custom-test-class');
  });
});
