/**
 * __tests__/components/ProfileBadges.test.tsx
 *
 * ProfileBadges' real logic: which badges appear is driven entirely by
 * which nested objects are present on sellerProfile (seller / store /
 * service-provider), never by any other field. Null sellerProfile (or
 * a null child) must never crash and must never render a badge for
 * that category.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileBadges } from '@/components/profile/ProfileBadges';
import type {
  PublicSellerProfile,
  PublicProfileStore,
  PublicProfileServiceProvider,
} from '@/types/user.types';

function makeStore(overrides: Partial<PublicProfileStore> = {}): PublicProfileStore {
  return {
    id: 's1',
    name: 'متجر تجريبي',
    description: 'وصف',
    logoUrl: null,
    coverImageUrl: null,
    city: 'غزة',
    plan: 'FREE',
    _count: { followers: 0, products: 0 },
    ...overrides,
  };
}

function makeServiceProvider(
  overrides: Partial<PublicProfileServiceProvider> = {},
): PublicProfileServiceProvider {
  return {
    id: 'sp1',
    businessName: 'خدمات تجريبية',
    businessType: 'INDIVIDUAL',
    logoUrl: null,
    description: 'وصف',
    serviceAreaCities: [],
    availabilityStatus: 'AVAILABLE',
    completedRequestsCount: 0,
    ...overrides,
  };
}

function makeSellerProfile(
  overrides: Partial<PublicSellerProfile> = {},
): PublicSellerProfile {
  return {
    id: 'sp-1',
    displayName: 'بائع تجريبي',
    bio: null,
    avatarUrl: null,
    verified: false,
    trustScore: 0,
    averageRating: '0',
    totalRatings: 0,
    activeAds: 0,
    totalSales: 0,
    responseRate: null,
    responseTimeMinutes: null,
    joinedSellingAt: '2024-01-01T00:00:00.000Z',
    _count: { serviceReviews: 0 },
    storeDetails: null,
    serviceProviderDetails: null,
    ...overrides,
  };
}

describe('ProfileBadges', () => {
  it('renders nothing when sellerProfile is null (plain user)', () => {
    const { container } = render(<ProfileBadges sellerProfile={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the seller badge when sellerProfile has no store or service-provider children', () => {
    render(<ProfileBadges sellerProfile={makeSellerProfile()} />);
    expect(screen.getByText('بائع')).toBeInTheDocument();
    expect(screen.queryByText('مقدم خدمة')).not.toBeInTheDocument();
    expect(screen.queryByText('صاحب متجر')).not.toBeInTheDocument();
  });

  it('shows the service-provider badge alongside seller when serviceProviderDetails is present', () => {
    render(
      <ProfileBadges
        sellerProfile={makeSellerProfile({ serviceProviderDetails: makeServiceProvider() })}
      />,
    );
    expect(screen.getByText('بائع')).toBeInTheDocument();
    expect(screen.getByText('مقدم خدمة')).toBeInTheDocument();
    expect(screen.queryByText('صاحب متجر')).not.toBeInTheDocument();
  });

  it('shows the store-owner badge as a link to the store when storeDetails is present', () => {
    render(
      <ProfileBadges
        sellerProfile={makeSellerProfile({ storeDetails: makeStore({ id: 'store-42' }) })}
      />,
    );
    expect(screen.getByText('بائع')).toBeInTheDocument();
    expect(screen.getByText('صاحب متجر')).toBeInTheDocument();
    expect(screen.queryByText('مقدم خدمة')).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: /زيارة متجر/ });
    expect(link).toHaveAttribute('href', '/stores/store-42');
  });

  it('shows all three badges when the seller has both a store and a service business', () => {
    render(
      <ProfileBadges
        sellerProfile={makeSellerProfile({
          storeDetails: makeStore(),
          serviceProviderDetails: makeServiceProvider(),
        })}
      />,
    );
    expect(screen.getByText('بائع')).toBeInTheDocument();
    expect(screen.getByText('مقدم خدمة')).toBeInTheDocument();
    expect(screen.getByText('صاحب متجر')).toBeInTheDocument();
  });

  it('does not render a link when storeDetails is null', () => {
    render(<ProfileBadges sellerProfile={makeSellerProfile()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not crash and shows no badges for a sellerProfile with null children', () => {
    const { container } = render(
      <ProfileBadges
        sellerProfile={makeSellerProfile({ storeDetails: null, serviceProviderDetails: null })}
      />,
    );
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText('بائع')).toBeInTheDocument();
    expect(screen.queryByText('مقدم خدمة')).not.toBeInTheDocument();
    expect(screen.queryByText('صاحب متجر')).not.toBeInTheDocument();
  });

  it('does not show trust/top-seller badges below their thresholds', () => {
    render(<ProfileBadges sellerProfile={makeSellerProfile({ trustScore: 699, totalSales: 49 })} />);
    expect(screen.queryByText('بائع مميز')).not.toBeInTheDocument();
    expect(screen.queryByText('الأكثر مبيعاً')).not.toBeInTheDocument();
  });

  it('shows the featured-trust badge once trustScore crosses the threshold', () => {
    render(<ProfileBadges sellerProfile={makeSellerProfile({ trustScore: 700 })} />);
    expect(screen.getByText('بائع مميز')).toBeInTheDocument();
    expect(screen.queryByText('الأكثر مبيعاً')).not.toBeInTheDocument();
  });

  it('shows the top-seller badge once totalSales crosses the threshold', () => {
    render(<ProfileBadges sellerProfile={makeSellerProfile({ totalSales: 50 })} />);
    expect(screen.getByText('الأكثر مبيعاً')).toBeInTheDocument();
    expect(screen.queryByText('بائع مميز')).not.toBeInTheDocument();
  });

  it('does not show the fast-responder badge when responseRate/responseTimeMinutes are null (not yet measured)', () => {
    render(<ProfileBadges sellerProfile={makeSellerProfile()} />);
    expect(screen.queryByText('سريع الاستجابة')).not.toBeInTheDocument();
  });

  it('does not show the fast-responder badge when only one of the two thresholds is met', () => {
    render(
      <ProfileBadges
        sellerProfile={makeSellerProfile({ responseRate: '95', responseTimeMinutes: 500 })}
      />,
    );
    expect(screen.queryByText('سريع الاستجابة')).not.toBeInTheDocument();
  });

  it('shows the fast-responder badge once both responseRate and responseTimeMinutes clear their thresholds', () => {
    render(
      <ProfileBadges
        sellerProfile={makeSellerProfile({ responseRate: '90', responseTimeMinutes: 15 })}
      />,
    );
    expect(screen.getByText('سريع الاستجابة')).toBeInTheDocument();
  });
});
