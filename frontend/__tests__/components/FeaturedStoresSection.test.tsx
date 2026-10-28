/** FeaturedStoresSection consumes the shared /home/feed cache. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';

vi.mock('@/hooks/queries/useHomeFeed', () => ({ useHomeFeed: vi.fn() }));
vi.mock('@/lib/useDataSaver', () => ({ useDataSaver: () => false }));
vi.mock('@/components/shared/skeletons', () => ({ StoreCardSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/stores/StoreCard', () => ({ StoreCard: ({ store }: { store: { name: string } }) => <div>{store.name}</div> }));
vi.mock('@/components/home/HomeScrollRail', () => ({
  HomeScrollRail: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HomeScrollRailItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const feed = (stores: Array<{ id: string; name: string }> = [], pending = false) => ({
  data: {
    meta: { city: null, citySource: 'none', personalized: false },
    bootstrap: { categories: { ads: null, products: null, services: null }, storeTypes: [], stats: null },
    featured: { carousel: { ads: null, products: null, stores: { items: [] } } },
    rails: {
      forYou: { ads: [], products: [], services: [] },
      ads: { items: [], source: 'general' }, products: { items: [], source: 'general' },
      services: { items: [], source: 'general' }, stores: { items: stores, source: 'general' },
      providers: { items: [], source: 'general' },
    },
  }, isPending: pending, isError: false, error: null, refetch: vi.fn(),
});

describe('FeaturedStoresSection', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(useHomeFeed).mockReturnValue(feed() as never); });

  it('shows an explicit empty state when the feed has no stores', () => {
    render(<FeaturedStoresSection />);
    expect(screen.getByText('متاجر تناسبك')).toBeInTheDocument();
    expect(screen.getByText('لا توجد متاجر بعد')).toBeInTheDocument();
  });

  it('renders store cards from the stores rail', () => {
    vi.mocked(useHomeFeed).mockReturnValue(feed([{ id: 's1', name: 'متجر مميز' }]) as never);
    render(<FeaturedStoresSection />);
    expect(screen.getByText('متاجر تناسبك')).toBeInTheDocument();
    expect(screen.getByText('متجر مميز')).toBeInTheDocument();
  });

  it('shows loading skeletons while the shared feed is pending', () => {
    vi.mocked(useHomeFeed).mockReturnValue({ ...feed(), data: undefined, isPending: true } as never);
    render(<FeaturedStoresSection />);
    expect(screen.getByText('متاجر تناسبك')).toBeInTheDocument();
  });
});
