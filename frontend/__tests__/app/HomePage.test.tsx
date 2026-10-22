/**
 * __tests__/app/HomePage.test.tsx
 *
 * The homepage is an async server component (prefetch + hydration) wrapping
 * <HomePageContent/>. Sections are stubbed: each has its own suite, this file
 * only guards composition, ordering, and the server prefetch wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomePage from '@/app/(public)/page';
import { HomePageContent } from '@/components/home/HomePageContent';
import { prefetchHomeFeed } from '@/lib/prefetch';

vi.mock('@/components/home/EagerHomeSections', () => ({ EagerHomeSections: () => <div data-testid="eager" /> }));
vi.mock('@/components/stories/StoriesRail', () => ({ StoriesRail: () => <div data-testid="stories" /> }));
vi.mock('@/components/home/ForYouMixedSection', () => ({ ForYouMixedSection: () => <div data-testid="for-you" /> }));
vi.mock('@/components/home/FollowingFeedSection', () => ({ FollowingFeedSection: () => <div data-testid="following" /> }));
vi.mock('@/components/home/HomeAboveFold', () => ({ HomeAboveFold: () => <div data-testid="above-fold" /> }));
vi.mock('@/components/home/RecentProductsSection', () => ({ RecentProductsSection: () => <div data-testid="products" /> }));
vi.mock('@/components/home/HomeServicesSection', () => ({ HomeServicesSection: () => <div data-testid="services" /> }));
vi.mock('@/components/home/FeaturedStoresSection', () => ({ FeaturedStoresSection: () => <div data-testid="stores" /> }));
vi.mock('@/components/home/NearbyProvidersSection', () => ({ NearbyProvidersSection: () => <div data-testid="nearby" /> }));
vi.mock('@/components/home/HomeAppPromo', () => ({ HomeAppPromo: () => <div data-testid="app-promo" /> }));
vi.mock('@/components/home/HomeBusyBoundary', () => ({
  HomeBusyBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/shared/LazySection', () => ({
  LazySection: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/prefetch', () => ({ prefetchHomeFeed: vi.fn().mockResolvedValue(undefined) }));

describe('HomePageContent', () => {
  function renderHomePageContent() {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <HomePageContent />
      </QueryClientProvider>,
    );
  }

  it('renders the above-the-fold block, every rail, and the footer helpers', async () => {
    renderHomePageContent();
    for (const id of [
      'eager', 'stories', 'for-you', 'following', 'above-fold', 'products',
      'services', 'stores', 'nearby', 'app-promo',
    ]) {
      expect(await screen.findByTestId(id)).toBeInTheDocument();
    }
  });

  it('keeps the documented section order', async () => {
    renderHomePageContent();
    const order = [
      'eager', 'stories', 'for-you', 'following', 'above-fold',
      'products', 'services', 'stores', 'nearby', 'app-promo',
    ];
    const nodes = await Promise.all(order.map((id) => screen.findByTestId(id)));
    for (let i = 1; i < nodes.length; i += 1) {
      expect(
        nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});

describe('HomePage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prefetches /home on the server and renders the content plus JSON-LD', async () => {
    const element = await HomePage();
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>,
    );

    expect(prefetchHomeFeed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('eager')).toBeInTheDocument();
    expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
  });
});
