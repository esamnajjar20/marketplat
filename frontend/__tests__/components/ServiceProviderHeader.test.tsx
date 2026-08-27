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
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceProviderHeader } from '@/components/services/ServiceProviderHeader';
import { useAuthStore } from '@/store/auth.store';
import type { ServiceProviderPublic, ServiceAvailability } from '@/types/service.types';

// FEAT-MSG-UNIFY: ServiceProviderHeader now reads useAuthStore directly
// (isOwnProvider check) in addition to MessageUserButtonGate reading it
// internally — mocked explicitly (rather than relying on the real
// store's unauthenticated default) so the new "own provider" test case
// below can assert the message button's self-hide behavior. Default
// state mirrors the real store's unauthenticated default, so every
// pre-existing test in this file keeps passing unmodified.
vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

function mockAuth(state: { user: Record<string, unknown> | null; isAuthenticated: boolean }) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
  );
}

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

// FEAT-MSG-UNIFY: ServiceProviderHeader now renders
// MessageUserButtonGate ("مراسلة مقدم الخدمة"), which calls
// useStartConversation (a react-query mutation) — mocked here so this
// file doesn't need a QueryClientProvider wrapper, same as
// PublicProfileHeader.test.tsx / StoreHeader.test.tsx. The gate's own
// self-hide/unauthenticated logic is covered by
// MessageUserButtonGate.test.tsx.
vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useStartConversation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

describe('ServiceProviderHeader', () => {
  beforeEach(() => {
    mockAuth({ user: null, isAuthenticated: false });
  });

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

  // FEAT-MSG-UNIFY
  describe('مراسلة مقدم الخدمة (MessageUserButtonGate)', () => {
    it('renders the message-provider button for a non-owner viewer', () => {
      render(<ServiceProviderHeader provider={makeProvider()} />);

      expect(screen.getByRole('button', { name: /مراسلة مقدم الخدمة/ })).toBeInTheDocument();
    });

    it('hides the message-provider button on the user\'s own provider page (self-messaging guard)', () => {
      mockAuth({ user: { id: 'user-1' }, isAuthenticated: true });
      render(<ServiceProviderHeader provider={makeProvider()} />);

      expect(screen.queryByRole('button', { name: /مراسلة مقدم الخدمة/ })).not.toBeInTheDocument();
    });
  });
});
