/**
 * __tests__/components/HomeServicesSection.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { useSequentialGeoSearch } from '@/hooks/queries/useSequentialGeoSearch';

vi.mock('@/hooks/queries/useServiceListings', () => ({
  useServiceListings: vi.fn(),
}));
vi.mock('@/hooks/useLocationResolver', () => ({
  useLocationResolver: vi.fn(() => ({
    isLoading: false,
    source: 'none',
    latitude: null,
    longitude: null,
  })),
}));
vi.mock('@/hooks/queries/useSequentialGeoSearch', () => ({
  useSequentialGeoSearch: vi.fn(() => ({
    settled: true,
    isLoading: false,
    isError: false,
    items: [],
  })),
}));
vi.mock('@/components/services/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { title: string } }) => (
    <div>{listing.title}</div>
  ),
}));
vi.mock('@/components/home/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock('@/components/home/LocationSourceBadge', () => ({
  LocationSourceBadge: () => null,
}));
vi.mock('@/components/shared/skeletons', () => ({
  StoreCardSkeleton: () => <div data-testid="skeleton" />,
}));
vi.mock('@/components/shared/ApiError', () => ({
  ApiError: ({ message }: { message?: string }) => <div>{message ?? 'error'}</div>,
}));
vi.mock('@/lib/listLimits', () => ({
  homeSectionLimit: () => 4,
}));
vi.mock('@/lib/distance', () => ({
  formatDistanceKm: (n: number) => `${n} كم`,
}));

describe('HomeServicesSection', () => {
  beforeEach(() => {
    vi.mocked(useLocationResolver).mockReturnValue({
      isLoading: false,
      source: 'none',
      latitude: null,
      longitude: null,
    } as never);
    vi.mocked(useSequentialGeoSearch).mockReturnValue({
      settled: true,
      isLoading: false,
      isError: false,
      items: [],
    } as never);
    vi.mocked(useServiceListings).mockReturnValue({
      data: {
        items: [
          { id: '1', title: 'سباكة منزلية' },
          { id: '2', title: 'كهرباء' },
        ],
      },
      isLoading: false,
      isError: false,
    } as never);
  });

  it('shows loading skeletons', () => {
    vi.mocked(useServiceListings).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);
    render(<HomeServicesSection />);
    expect(screen.getByText('خدمات متاحة')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders service titles from general query', () => {
    render(<HomeServicesSection />);
    expect(screen.getByText('خدمات متاحة')).toBeInTheDocument();
    expect(screen.getByText('سباكة منزلية')).toBeInTheDocument();
    expect(screen.getByText('كهرباء')).toBeInTheDocument();
  });
});
