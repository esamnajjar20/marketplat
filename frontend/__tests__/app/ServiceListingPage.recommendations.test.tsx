/**
 * __tests__/app/ServiceListingPage.recommendations.test.tsx
 *
 * PR4C integration coverage: the service listing detail page
 * (app/(public)/services/[id]/page.tsx) must mount
 * ServiceRecommendations with excludeServiceListingId set to the
 * listing actually being viewed, alongside its existing content
 * (ServiceViewTracker/ServiceListingDetail/ServiceRequestButton) —
 * none of which this PR touches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceListingPage from '@/app/(public)/services/[id]/page';
import { serviceListingsApi } from '@/api/service-listings.api';

vi.mock('@/api/service-listings.api', () => ({
  serviceListingsApi: { getById: vi.fn() },
}));

vi.mock('@/components/services/ServiceListingDetail', () => ({
  ServiceListingDetail: ({ listing }: { listing: { id: string } }) => (
    <div data-testid="listing-detail">{listing.id}</div>
  ),
}));

vi.mock('@/components/services/ServiceRequestButton', () => ({
  ServiceRequestButton: () => <div data-testid="request-button" />,
}));

vi.mock('@/components/services/ServiceViewTracker', () => ({
  ServiceViewTracker: () => null,
}));

vi.mock('@/components/recommendations/ServiceRecommendations', () => ({
  ServiceRecommendations: ({ excludeServiceListingId }: { excludeServiceListingId: string }) => (
    <div data-testid="service-recommendations">{excludeServiceListingId}</div>
  ),
}));

const listing = {
  id: 'svc-1',
  title: 'خدمة تنظيف',
  categoryId: 'cat-1',
  provider: { sellerProfile: { userId: 'user-1' } },
};

describe('ServiceListingPage — recommendations integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ServiceRecommendations excluding the listing being viewed', async () => {
    (serviceListingsApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: listing },
    });

    const jsx = await ServiceListingPage({ params: Promise.resolve({ id: 'svc-1' }) });
    render(jsx);

    expect(screen.getByTestId('listing-detail')).toHaveTextContent('svc-1');
    expect(screen.getByTestId('service-recommendations')).toHaveTextContent('svc-1');
  });

  it('does not render recommendations on the 404 empty state', async () => {
    (serviceListingsApi.getById as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('404'));

    const jsx = await ServiceListingPage({ params: Promise.resolve({ id: 'missing' }) });
    render(jsx);

    expect(screen.queryByTestId('service-recommendations')).not.toBeInTheDocument();
  });
});
