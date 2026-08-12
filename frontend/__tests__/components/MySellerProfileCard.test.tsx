/**
 * __tests__/components/MySellerProfileCard.test.tsx
 *
 * Coverage gap: 0% prior coverage. Pure props-driven card — covers
 * the verified/unverified badge branch, optional bio rendering, the
 * rating fallback ('—') when totalRatings is 0 vs a formatted rating
 * otherwise, the stats grid, and the two CTA links (public profile,
 * AUDIT-FIX #5's "create your store" next-step link).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MySellerProfileCard } from '@/components/sellers/MySellerProfileCard';
import type { SellerProfile } from '@/types/seller.types';

const baseProfile: SellerProfile = {
  id: 'seller-1',
  displayName: 'متجر أبو محمد',
  verified: true,
  bio: 'نبيع أجهزة كهربائية مستعملة بحالة ممتازة',
  activeAds: 12,
  totalSales: 34,
  averageRating: '4.5',
  totalRatings: 20,
  joinedSellingAt: '2026-01-15T00:00:00.000Z',
} as SellerProfile;

describe('MySellerProfileCard', () => {
  it('renders the verified badge when the seller is verified', () => {
    render(<MySellerProfileCard profile={baseProfile} />);

    expect(screen.getByText('بائع موثّق')).toBeInTheDocument();
    expect(screen.queryByText('غير موثّق')).not.toBeInTheDocument();
  });

  it('renders the unverified badge when the seller is not verified', () => {
    render(<MySellerProfileCard profile={{ ...baseProfile, verified: false }} />);

    expect(screen.getByText('غير موثّق')).toBeInTheDocument();
  });

  it('renders the bio when present', () => {
    render(<MySellerProfileCard profile={baseProfile} />);

    expect(screen.getByText('نبيع أجهزة كهربائية مستعملة بحالة ممتازة')).toBeInTheDocument();
  });

  it('omits the bio paragraph when bio is empty', () => {
    render(<MySellerProfileCard profile={{ ...baseProfile, bio: '' }} />);

    expect(screen.queryByText('نبيع أجهزة كهربائية مستعملة بحالة ممتازة')).not.toBeInTheDocument();
  });

  it('renders active ads, total sales, and formatted rating', () => {
    render(<MySellerProfileCard profile={baseProfile} />);

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('20 تقييم')).toBeInTheDocument();
  });

  it('shows a "—" placeholder for rating when totalRatings is 0', () => {
    render(<MySellerProfileCard profile={{ ...baseProfile, totalRatings: 0 }} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('4.5')).not.toBeInTheDocument();
  });

  it('links to the public seller profile page', () => {
    render(<MySellerProfileCard profile={baseProfile} />);

    const link = screen.getByText('عرض صفحتي العامة كبائع').closest('a');
    expect(link).toHaveAttribute('href', expect.stringContaining('seller-1'));
  });

  it('renders the "create your store" CTA (AUDIT-FIX #5)', () => {
    render(<MySellerProfileCard profile={baseProfile} />);

    expect(screen.getByText('أنشئ متجرك الآن')).toBeInTheDocument();
  });
});
