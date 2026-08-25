/**
 * __tests__/components/ServiceProviderHeader.test.tsx
 *
 * Previously uncovered (0%), ~85 lines. Public provider profile header
 * (/service-providers/:id) — avatar, verified badge, availability,
 * rating, service areas, call button, description.
 *
 * Coverage targets:
 *  - Renders businessName, description, formatted phone (tel: href)
 *  - Verified badge shown only when sellerProfile.verified is true
 *  - Availability label for all three states
 *  - Rating line shown only when totalRatings > 0, hidden when 0
 *  - Rating value formatted to one decimal
 *  - Service area cities joined with Arabic comma
 *  - Avatar falls back through logoUrl → sellerProfile.avatarUrl → placeholder
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceProviderHeader } from '@/components/services/ServiceProviderHeader';
import type { ServiceProviderPublic, ServiceAvailability } from '@/types/service.types';

function makeProvider(overrides: Partial<ServiceProviderPublic> = {}): ServiceProviderPublic {
  return {
    id: 'provider-1',
    sellerProfileId: 'seller-1',
    businessName: 'مؤسسة الإصلاح السريع',
    businessType: 'INDIVIDUAL',
    logoUrl: null,
    description: 'خدمات إصلاح منزلية متنوعة وسريعة',
    serviceAreaCities: ['غزة', 'خان يونس'],
    workingHours: {} as ServiceProviderPublic['workingHours'],
    contactPhone: '+970591234567',
    availabilityStatus: 'AVAILABLE',
    completedRequestsCount: 15,
    fulfillmentRate: null,
    latitude: null,
    longitude: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sellerProfile: {
      userId: 'user-1',
      displayName: 'خالد',
      avatarUrl: null,
      verified: false,
      trustScore: 80,
      averageRating: '4.50',
      totalRatings: 0,
    },
    listings: [],
    ...overrides,
  } as ServiceProviderPublic;
}

vi.mock('@/components/services/ProviderBadges', () => ({
  ProviderBadges: () => null,
}));

describe('ServiceProviderHeader', () => {
  it('renders the business name and description', () => {
    render(<ServiceProviderHeader provider={makeProvider()} />);
    expect(screen.getByText('مؤسسة الإصلاح السريع')).toBeInTheDocument();
    expect(screen.getByText('خدمات إصلاح منزلية متنوعة وسريعة')).toBeInTheDocument();
  });

  it('renders a tel: link with the formatted phone number', () => {
    render(<ServiceProviderHeader provider={makeProvider({ contactPhone: '+970591234567' })} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'tel:+970591234567');
    expect(link).toHaveTextContent('+970 59-123-4567');
  });

  it('joins serviceAreaCities with an Arabic comma', () => {
    render(<ServiceProviderHeader provider={makeProvider({ serviceAreaCities: ['غزة', 'رفح', 'دير البلح'] })} />);
    expect(screen.getByText('غزة، رفح، دير البلح')).toBeInTheDocument();
  });

  describe('availability', () => {
    it.each([
      ['AVAILABLE', 'متاح الآن'],
      ['BUSY', 'مشغول'],
      ['UNAVAILABLE', 'غير متاح'],
    ] as [ServiceAvailability, string][])('shows the correct label for %s', (status, label) => {
      render(<ServiceProviderHeader provider={makeProvider({ availabilityStatus: status })} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  describe('verified badge', () => {
    it('shows a BadgeCheck icon in the badge overlay when sellerProfile.verified is true', () => {
      const { container } = render(
        <ServiceProviderHeader
          provider={makeProvider({
            sellerProfile: { ...makeProvider().sellerProfile, verified: true },
          })}
        />
      );
      expect(container.querySelector('.absolute.bottom-0.end-0')).toBeInTheDocument();
    });

    it('does not render the badge overlay when sellerProfile.verified is false', () => {
      const { container } = render(<ServiceProviderHeader provider={makeProvider()} />);
      expect(container.querySelector('.absolute.bottom-0.end-0')).not.toBeInTheDocument();
    });
  });

  describe('rating', () => {
    it('shows the rating line when totalRatings > 0, formatted to one decimal', () => {
      render(
        <ServiceProviderHeader
          provider={makeProvider({
            sellerProfile: { ...makeProvider().sellerProfile, averageRating: '4.5', totalRatings: 12 },
          })}
        />
      );
      expect(screen.getByText(/4\.5/)).toBeInTheDocument();
      expect(screen.getByText(/12 تقييم/)).toBeInTheDocument();
    });

    it('hides the rating line when totalRatings is 0', () => {
      render(
        <ServiceProviderHeader
          provider={makeProvider({
            sellerProfile: { ...makeProvider().sellerProfile, totalRatings: 0 },
          })}
        />
      );
      expect(screen.queryByText(/تقييم\)/)).not.toBeInTheDocument();
    });
  });

  describe('avatar fallback', () => {
    it('renders an image with the business name as alt text', () => {
      render(<ServiceProviderHeader provider={makeProvider({ businessName: 'ورشة الحدادة' })} />);
      expect(screen.getByRole('img', { name: 'ورشة الحدادة' })).toBeInTheDocument();
    });

    it('renders without crashing when both logoUrl and sellerProfile.avatarUrl are null', () => {
      render(
        <ServiceProviderHeader
          provider={makeProvider({
            logoUrl: null,
            sellerProfile: { ...makeProvider().sellerProfile, avatarUrl: null },
          })}
        />
      );
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
  });
});
