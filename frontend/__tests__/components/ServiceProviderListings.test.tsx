/**
 * __tests__/components/ServiceProviderListings.test.tsx
 *
 * Previously uncovered (0%), ~50 lines. Renders a provider's own
 * listings on their public page — filters to ACTIVE only, and stitches
 * each bare ServiceListing back into a ServiceListingWithProvider using
 * the parent provider object (the provider's own /service-providers/:id
 * response embeds bare listings with no per-item provider summary).
 *
 * Coverage targets:
 *  - Empty state shown when there are no ACTIVE listings (including
 *    when all listings are non-ACTIVE, and when the array is empty)
 *  - Only ACTIVE listings are rendered, non-ACTIVE ones are filtered out
 *  - Provider info is correctly stitched onto each rendered card
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceProviderListings } from '@/components/services/ServiceProviderListings';
import type { ServiceListing, ServiceProviderPublic } from '@/types/service.types';

vi.mock('@/components/services/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { id: string; title: string; provider: { businessName: string } } }) => (
    <div data-testid="listing-card">
      {listing.title} — {listing.provider.businessName}
    </div>
  ),
}));

function makeProvider(overrides: Partial<ServiceProviderPublic> = {}): ServiceProviderPublic {
  return {
    id: 'provider-1',
    sellerProfileId: 'seller-1',
    businessName: 'مؤسسة البناء',
    businessType: 'SMALL_BUSINESS',
    logoUrl: null,
    description: '',
    serviceAreaCities: [],
    workingHours: {} as ServiceProviderPublic['workingHours'],
    contactPhone: '+970591234567',
    availabilityStatus: 'AVAILABLE',
    completedRequestsCount: 0,
    fulfillmentRate: null,
    latitude: null,
    longitude: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sellerProfile: {
      userId: 'user-1',
      displayName: 'يوسف',
      avatarUrl: null,
      verified: true,
      trustScore: 90,
      averageRating: '4.80',
      totalRatings: 5,
    },
    listings: [],
    ...overrides,
  } as ServiceProviderPublic;
}

function makeListing(overrides: Partial<ServiceListing> = {}): ServiceListing {
  return {
    id: 'listing-1',
    providerId: 'provider-1',
    categoryId: 'cat-1',
    title: 'بناء جدران',
    description: '',
    images: [],
    pricingType: 'FIXED',
    price: '500.00',
    durationEstimate: null,
    serviceLocation: 'AT_CUSTOMER',
    status: 'ACTIVE',
    views: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ServiceProviderListings', () => {
  it('shows the empty state when the listings array is empty', () => {
    render(<ServiceProviderListings provider={makeProvider()} listings={[]} />);
    expect(screen.getByText('لا توجد خدمات منشورة')).toBeInTheDocument();
    expect(screen.getByText('لم ينشر مقدم الخدمة أي خدمة نشطة بعد')).toBeInTheDocument();
  });

  it('shows the empty state when all listings are non-ACTIVE', () => {
    render(
      <ServiceProviderListings
        provider={makeProvider()}
        listings={[makeListing({ status: 'PAUSED' }), makeListing({ id: 'l2', status: 'DELETED' })]}
      />
    );
    expect(screen.getByText('لا توجد خدمات منشورة')).toBeInTheDocument();
    expect(screen.queryByTestId('listing-card')).not.toBeInTheDocument();
  });

  it('renders only ACTIVE listings, filtering out others', () => {
    render(
      <ServiceProviderListings
        provider={makeProvider()}
        listings={[
          makeListing({ id: 'l1', title: 'خدمة نشطة', status: 'ACTIVE' }),
          makeListing({ id: 'l2', title: 'خدمة موقوفة', status: 'PAUSED' }),
        ]}
      />
    );
    const cards = screen.getAllByTestId('listing-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('خدمة نشطة');
  });

  it('stitches the provider businessName onto each listing card', () => {
    render(
      <ServiceProviderListings
        provider={makeProvider({ businessName: 'مصنع الأثاث' })}
        listings={[makeListing({ title: 'تصنيع أثاث', status: 'ACTIVE' })]}
      />
    );
    expect(screen.getByTestId('listing-card')).toHaveTextContent('مصنع الأثاث');
  });

  it('renders one card per ACTIVE listing when there are several', () => {
    render(
      <ServiceProviderListings
        provider={makeProvider()}
        listings={[
          makeListing({ id: 'l1', status: 'ACTIVE' }),
          makeListing({ id: 'l2', status: 'ACTIVE' }),
          makeListing({ id: 'l3', status: 'ACTIVE' }),
        ]}
      />
    );
    expect(screen.getAllByTestId('listing-card')).toHaveLength(3);
  });
});
