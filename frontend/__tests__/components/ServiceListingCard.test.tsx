/**
 * __tests__/components/ServiceListingCard.test.tsx
 *
 * Previously uncovered (0%), ~90 lines. Pure presentational card for
 * browse/search results (services/store equivalent of AdCard).
 *
 * Coverage targets:
 *  - Links to /services/:id
 *  - Renders title, provider businessName
 *  - Price formatting per pricingType: FIXED (plain), STARTING_FROM
 *    ("يبدأ من ..."), NEGOTIABLE / null price ("حسب الاتفاق")
 *  - Availability dot + label for all three ServiceAvailability states
 *  - Verified badge shown only when sellerProfile.verified is true
 *  - Falls back to placeholder image when no images present
 *  - Applies additional className when provided
 *
 *  FEAT-FAVORITE-POLYMORPHIC PR3: ServiceListingCard now also renders
 *  a FavoriteButton. Mocked out (own behavior covered by
 *  FavoriteButton.test.tsx/useFavorites.test.tsx) so these tests
 *  don't need a QueryClientProvider wrapper.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import type { ServiceListingWithProvider, ServiceAvailability, ServicePricingType } from '@/types/service.types';

vi.mock('@/components/shared/FavoriteButton', () => ({
  FavoriteButton: () => <div data-testid="favorite-button" />,
}));

function makeListing(overrides: Partial<ServiceListingWithProvider> = {}): ServiceListingWithProvider {
  return {
    id: 'listing-1',
    providerId: 'provider-1',
    categoryId: 'cat-1',
    title: 'تصليح مكيفات منزلية',
    description: 'صيانة وتركيب مكيفات',
    images: ['https://res.cloudinary.com/demo/image/upload/v1/listing.jpg'],
    pricingType: 'FIXED',
    price: '150.00',
    durationEstimate: '2 ساعة',
    serviceLocation: 'AT_CUSTOMER',
    status: 'ACTIVE',
    views: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    provider: {
      id: 'provider-1',
      businessName: 'ورشة التبريد الحديثة',
      logoUrl: null,
      availabilityStatus: 'AVAILABLE',
      sellerProfile: {
        userId: 'user-1',
        displayName: 'أحمد',
        verified: false,
        averageRating: null,
      },
    },
    ...overrides,
  } as ServiceListingWithProvider;
}

describe('ServiceListingCard', () => {
  it('links to the service detail page', () => {
    render(<ServiceListingCard listing={makeListing({ id: 'listing-99' })} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/services/listing-99');
  });

  it('renders the title and provider business name', () => {
    render(<ServiceListingCard listing={makeListing()} />);
    expect(screen.getByText('تصليح مكيفات منزلية')).toBeInTheDocument();
    expect(screen.getByText('ورشة التبريد الحديثة')).toBeInTheDocument();
  });

  describe('price formatting', () => {
    it('shows the plain formatted price for FIXED pricing', () => {
      render(<ServiceListingCard listing={makeListing({ pricingType: 'FIXED', price: '150.00' })} />);
      expect(screen.getByText(/150/)).toBeInTheDocument();
      expect(screen.queryByText(/يبدأ من/)).not.toBeInTheDocument();
    });

    it('prefixes "يبدأ من" for STARTING_FROM pricing', () => {
      render(<ServiceListingCard listing={makeListing({ pricingType: 'STARTING_FROM', price: '50.00' })} />);
      expect(screen.getByText(/^يبدأ من/)).toBeInTheDocument();
    });

    it('shows "حسب الاتفاق" for NEGOTIABLE pricing regardless of price value', () => {
      render(<ServiceListingCard listing={makeListing({ pricingType: 'NEGOTIABLE', price: null })} />);
      expect(screen.getByText('حسب الاتفاق')).toBeInTheDocument();
    });

    it('shows "حسب الاتفاق" when price is null even for FIXED type', () => {
      const listing = makeListing({ pricingType: 'FIXED' as ServicePricingType, price: null });
      render(<ServiceListingCard listing={listing} />);
      expect(screen.getByText('حسب الاتفاق')).toBeInTheDocument();
    });
  });

  describe('availability', () => {
    it.each([
      ['AVAILABLE', 'متاح الآن'],
      ['BUSY', 'مشغول'],
      ['UNAVAILABLE', 'غير متاح'],
    ] as [ServiceAvailability, string][])('shows the correct label for %s', (status, label) => {
      render(<ServiceListingCard listing={makeListing({ provider: { ...makeListing().provider, availabilityStatus: status } })} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  describe('verified badge', () => {
    it('renders the verified badge when sellerProfile.verified is true', () => {
      render(
        <ServiceListingCard
          listing={makeListing({
            provider: {
              ...makeListing().provider,
              sellerProfile: { ...makeListing().provider.sellerProfile, verified: true },
            },
          })}
        />
      );
      expect(screen.getByLabelText('مقدم خدمة موثّق')).toBeInTheDocument();
    });

    it('does not render the verified badge when sellerProfile.verified is false', () => {
      render(<ServiceListingCard listing={makeListing()} />);
      expect(screen.queryByLabelText('مقدم خدمة موثّق')).not.toBeInTheDocument();
    });
  });

  it('renders an image with the listing title as alt text', () => {
    render(<ServiceListingCard listing={makeListing({ title: 'صيانة سيارات' })} />);
    expect(screen.getByRole('img', { name: 'صيانة سيارات' })).toBeInTheDocument();
  });

  it('falls back to the placeholder image when images array is empty', () => {
    render(<ServiceListingCard listing={makeListing({ images: [] })} />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toContain('data:image/svg+xml');
  });

  it('applies an additional className when provided', () => {
    const { container } = render(<ServiceListingCard listing={makeListing()} className="custom-class" />);
    expect(container.querySelector('a')?.className).toContain('custom-class');
  });
});
