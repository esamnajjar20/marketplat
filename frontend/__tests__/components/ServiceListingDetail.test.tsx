/**
 * __tests__/components/ServiceListingDetail.test.tsx
 *
 * Previously uncovered (0%), ~85 lines. Full detail view for a single
 * service listing (/services/:id) — image gallery, price, location/
 * duration/views meta, description, and a link out to the provider.
 *
 * Coverage targets:
 *  - Renders title, description, price (same pricingType logic as
 *    ServiceListingCard — FIXED/STARTING_FROM/NEGOTIABLE/null)
 *  - Location label for all three ServiceLocationType values
 *  - durationEstimate shown only when present
 *  - views count and relative time render
 *  - Image gallery caps at 4 images, falls back to placeholder when empty
 *  - Provider link: href, businessName, verified badge gated on
 *    sellerProfile.verified
 *
 *  FEAT-FAVORITE-POLYMORPHIC PR3: ServiceListingDetail now also
 *  renders a FavoriteButton (warm=true). Mocked out (own behavior
 *  covered by FavoriteButton.test.tsx/useFavorites.test.tsx) so these
 *  tests don't need a QueryClientProvider wrapper.
 *
 *  FEAT: ServiceListingDetail also renders MessageUserButtonGate (the
 *  "مراسلة" CTA in the provider-link footer), which reads
 *  useStartConversation() (a react-query mutation). Mocked the same
 *  way PublicProfileHeader.test.tsx mocks it, so this file still
 *  doesn't need a QueryClientProvider wrapper.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceListingDetail } from '@/components/services/ServiceListingDetail';
import { formatRelativeTime } from '@/lib/formatters';
import type { ServiceListingWithProvider, ServiceLocationType } from '@/types/service.types';

vi.mock('@/components/shared/FavoriteButton', () => ({
  FavoriteButton: () => <div data-testid="favorite-button" />,
}));

// ReportServiceButton reads useReportService() (react-query mutation) —
// unmocked it throws for lack of a QueryClientProvider; not what this
// file is testing, so stub it like FavoriteButton above.
vi.mock('@/components/services/ReportServiceButton', () => ({
  ReportServiceButton: () => <div data-testid="report-service-button" />,
}));

vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useStartConversation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

function makeListing(overrides: Partial<ServiceListingWithProvider> = {}): ServiceListingWithProvider {
  return {
    id: 'listing-1',
    providerId: 'provider-1',
    categoryId: 'cat-1',
    title: 'تنظيف منازل شامل',
    description: 'خدمة تنظيف كاملة للمنزل\nتشمل جميع الغرف',
    images: [
      'https://res.cloudinary.com/demo/image/upload/v1/a.jpg',
      'https://res.cloudinary.com/demo/image/upload/v1/b.jpg',
    ],
    pricingType: 'FIXED',
    price: '200.00',
    durationEstimate: '3 ساعات',
    serviceLocation: 'AT_CUSTOMER',
    status: 'ACTIVE',
    views: 42,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    provider: {
      id: 'provider-1',
      businessName: 'شركة النظافة الذهبية',
      logoUrl: null,
      availabilityStatus: 'AVAILABLE',
      sellerProfile: {
        userId: 'user-1',
        displayName: 'سارة',
        verified: false,
        averageRating: null,
      },
    },
    ...overrides,
  } as ServiceListingWithProvider;
}

describe('ServiceListingDetail', () => {
  it('renders title and description', () => {
    render(<ServiceListingDetail listing={makeListing()} />);
    expect(screen.getByText('تنظيف منازل شامل')).toBeInTheDocument();
    expect(screen.getByText(/خدمة تنظيف كاملة للمنزل/)).toBeInTheDocument();
  });

  describe('price formatting', () => {
    it('shows plain price for FIXED', () => {
      render(<ServiceListingDetail listing={makeListing({ pricingType: 'FIXED', price: '200.00' })} />);
      expect(screen.getByText(/200/)).toBeInTheDocument();
    });

    it('prefixes "يبدأ من" for STARTING_FROM', () => {
      render(<ServiceListingDetail listing={makeListing({ pricingType: 'STARTING_FROM', price: '80.00' })} />);
      expect(screen.getByText(/^يبدأ من/)).toBeInTheDocument();
    });

    it('shows "حسب الاتفاق" for NEGOTIABLE', () => {
      render(<ServiceListingDetail listing={makeListing({ pricingType: 'NEGOTIABLE', price: null })} />);
      expect(screen.getByText('حسب الاتفاق')).toBeInTheDocument();
    });
  });

  describe('location label', () => {
    it.each([
      ['AT_CUSTOMER', 'لدى العميل'],
      ['AT_PROVIDER', 'لدى مقدم الخدمة'],
      ['REMOTE', 'عن بُعد'],
    ] as [ServiceLocationType, string][])('shows the correct label for %s', (loc, label) => {
      render(<ServiceListingDetail listing={makeListing({ serviceLocation: loc })} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('shows durationEstimate when present', () => {
    render(<ServiceListingDetail listing={makeListing({ durationEstimate: '3 ساعات' })} />);
    expect(screen.getByText('3 ساعات')).toBeInTheDocument();
  });

  it('does not render a duration element when durationEstimate is null', () => {
    render(<ServiceListingDetail listing={makeListing({ durationEstimate: null })} />);
    expect(screen.queryByText(/ساع/)).not.toBeInTheDocument();
  });

  it('renders the views count', () => {
    render(<ServiceListingDetail listing={makeListing({ views: 42 })} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a relative time string for createdAt', () => {
    const listing = makeListing({ createdAt: '2026-01-01T00:00:00.000Z' });
    render(<ServiceListingDetail listing={listing} />);
    expect(screen.getByText(formatRelativeTime(listing.createdAt))).toBeInTheDocument();
  });

  describe('image gallery', () => {
    it('caps rendered images at 4 even when more are provided', () => {
      const listing = makeListing({
        images: Array.from({ length: 6 }, (_, i) => `https://res.cloudinary.com/demo/image/upload/v1/${i}.jpg`),
      });
      render(<ServiceListingDetail listing={listing} />);
      expect(screen.getAllByRole('img')).toHaveLength(4);
    });

    it('falls back to a single placeholder image when images array is empty', () => {
      render(<ServiceListingDetail listing={makeListing({ images: [] })} />);
      const imgs = screen.getAllByRole('img');
      expect(imgs).toHaveLength(1);
      expect((imgs[0] as HTMLImageElement).src).toContain('data:image/svg+xml');
    });
  });

  describe('provider link', () => {
    it('links to the provider\'s unified profile page', () => {
      // UNIFIED-PROFILE: /service-providers/[id] is now a redirect back
      // to /profile/[userId] — links straight there using the nested
      // sellerProfile.userId instead.
      render(<ServiceListingDetail listing={makeListing({
        provider: { ...makeListing().provider, sellerProfile: { ...makeListing().provider.sellerProfile, userId: 'user-77' } },
      })} />);
      expect(screen.getByRole('link')).toHaveAttribute('href', '/profile/user-77');
    });

    it('renders the provider business name twice (label + "عرض كل خدمات" line)', () => {
      render(<ServiceListingDetail listing={makeListing({ provider: { ...makeListing().provider, businessName: 'مؤسسة الأمل' } })} />);
      expect(screen.getAllByText(/مؤسسة الأمل/).length).toBeGreaterThanOrEqual(2);
    });

    it('shows the verified badge when sellerProfile.verified is true', () => {
      render(
        <ServiceListingDetail
          listing={makeListing({
            provider: {
              ...makeListing().provider,
              sellerProfile: { ...makeListing().provider.sellerProfile, verified: true },
            },
          })}
        />
      );
      expect(screen.getByText('موثّق')).toBeInTheDocument();
    });

    it('does not show the verified badge when sellerProfile.verified is false', () => {
      render(<ServiceListingDetail listing={makeListing()} />);
      expect(screen.queryByText('موثّق')).not.toBeInTheDocument();
    });
  });
});
