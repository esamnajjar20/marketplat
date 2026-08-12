/**
 * __tests__/components/ServiceProviderCard.test.tsx
 *
 * Previously uncovered (0%), ~238 lines (mostly styling). Pure
 * presentational card for /service-providers nearby results —
 * deliberately reads only the fields NearbyServiceProviderRow actually
 * has (no sellerProfile join, so no verified badge/rating here, unlike
 * ServiceListingCard/ServiceProviderHeader).
 *
 * Coverage targets:
 *  - Links to /service-providers/:id
 *  - Renders businessName, description, contact phone (formatted),
 *    joined serviceAreaCities
 *  - Distance label: meters under 1km, one-decimal km at/above 1km
 *  - Availability dot + label for all three ServiceAvailability states
 *  - Avatar falls back to the placeholder when logoUrl is null
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import type { NearbyServiceProviderRow, ServiceAvailability } from '@/types/service.types';

function makeProvider(overrides: Partial<NearbyServiceProviderRow> = {}): NearbyServiceProviderRow {
  return {
    id: 'provider-1',
    sellerProfileId: 'seller-1',
    businessName: 'خدمات السباكة السريعة',
    businessType: 'INDIVIDUAL',
    logoUrl: null,
    description: 'خدمات سباكة منزلية سريعة وموثوقة',
    serviceAreaCities: ['غزة', 'خان يونس'],
    workingHours: {} as NearbyServiceProviderRow['workingHours'],
    contactPhone: '+970591234567',
    availabilityStatus: 'AVAILABLE',
    completedRequestsCount: 10,
    fulfillmentRate: null,
    latitude: null,
    longitude: null,
    distanceKm: 2.345,
    ...overrides,
  } as NearbyServiceProviderRow;
}

describe('ServiceProviderCard', () => {
  it('links to the provider profile page', () => {
    render(<ServiceProviderCard provider={makeProvider({ id: 'provider-42' })} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/service-providers/provider-42');
  });

  it('renders the business name, description, and formatted phone', () => {
    render(<ServiceProviderCard provider={makeProvider({ contactPhone: '+970591234567' })} />);
    expect(screen.getByText('خدمات السباكة السريعة')).toBeInTheDocument();
    expect(screen.getByText('خدمات سباكة منزلية سريعة وموثوقة')).toBeInTheDocument();
    expect(screen.getByText('+970 59-123-4567')).toBeInTheDocument();
  });

  it('joins serviceAreaCities with an Arabic comma', () => {
    render(<ServiceProviderCard provider={makeProvider({ serviceAreaCities: ['غزة', 'رفح', 'دير البلح'] })} />);
    expect(screen.getByText('غزة، رفح، دير البلح')).toBeInTheDocument();
  });

  describe('distance formatting', () => {
    it('shows meters (rounded) when distance is under 1km', () => {
      render(<ServiceProviderCard provider={makeProvider({ distanceKm: 0.456 })} />);
      expect(screen.getByText('456 م')).toBeInTheDocument();
    });

    it('shows one-decimal km when distance is at or above 1km', () => {
      render(<ServiceProviderCard provider={makeProvider({ distanceKm: 3.14 })} />);
      expect(screen.getByText('3.1 كم')).toBeInTheDocument();
    });

    it('shows km (not meters) exactly at the 1km boundary', () => {
      render(<ServiceProviderCard provider={makeProvider({ distanceKm: 1 })} />);
      expect(screen.getByText('1.0 كم')).toBeInTheDocument();
    });
  });

  describe('availability', () => {
    it.each([
      ['AVAILABLE', 'متاح الآن'],
      ['BUSY', 'مشغول'],
      ['UNAVAILABLE', 'غير متاح'],
    ] as [ServiceAvailability, string][])('shows the correct label for %s', (status, label) => {
      render(<ServiceProviderCard provider={makeProvider({ availabilityStatus: status })} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('renders an avatar image with the business name as alt text', () => {
    render(<ServiceProviderCard provider={makeProvider({ businessName: 'ورشة النجارة' })} />);
    expect(screen.getByRole('img', { name: 'ورشة النجارة' })).toBeInTheDocument();
  });

  it('applies an additional className when provided', () => {
    const { container } = render(<ServiceProviderCard provider={makeProvider()} className="custom-class" />);
    expect(container.querySelector('a')?.className).toContain('custom-class');
  });
});
