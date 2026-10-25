/** HomeServicesSection consumes the shared /home/feed cache. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { useForYouItems } from '@/hooks/queries/useForYouItems';

vi.mock('@/hooks/queries/useHomeFeed', () => ({ useHomeFeed: vi.fn() }));
vi.mock('@/hooks/queries/useForYouItems', () => ({ useForYouItems: vi.fn(() => []), forYouIdsOf: vi.fn(() => new Set()) }));
vi.mock('@/lib/useDataSaver', () => ({ useDataSaver: () => false }));
vi.mock('@/components/shared/skeletons', () => ({ ServiceListingCardSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/services/ServiceListingCard', () => ({ ServiceListingCard: ({ listing }: { listing: { title: string } }) => <div>{listing.title}</div> }));
vi.mock('@/components/home/HomeScrollRail', () => ({
  HomeScrollRail: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HomeScrollRailItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const feed = (services: Array<{ id: string; title: string }> = [], pending = false) => ({
  data: {
    meta: { city: null, citySource: 'none', personalized: false },
    bootstrap: { categories: { ads: null, products: null, services: null }, storeTypes: [], stats: null },
    featured: { carousel: { ads: null, products: null, stores: null } },
    rails: {
      forYou: { ads: [], products: [], services: [] },
      ads: { items: [], source: 'general' }, products: { items: [], source: 'general' },
      services: { items: services, source: 'general' }, stores: { items: [], source: 'general' },
      providers: { items: [], source: 'general' },
    },
  }, isPending: pending, isError: false, error: null, refetch: vi.fn(),
});

describe('HomeServicesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useForYouItems).mockReturnValue([] as never);
    vi.mocked(useHomeFeed).mockReturnValue(feed([{ id: '1', title: 'سباكة منزلية' }, { id: '2', title: 'كهرباء' }]) as never);
  });

  it('shows loading skeletons while the shared feed is pending', () => {
    vi.mocked(useHomeFeed).mockReturnValue({ ...feed(), data: undefined, isPending: true } as never);
    render(<HomeServicesSection />);
    expect(screen.getByText('خدمات تناسبك')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders service titles from the shared services rail', () => {
    render(<HomeServicesSection />);
    expect(screen.getByText('خدمات تناسبك')).toBeInTheDocument();
    expect(screen.getByText('سباكة منزلية')).toBeInTheDocument();
    expect(screen.getByText('كهرباء')).toBeInTheDocument();
  });
});
