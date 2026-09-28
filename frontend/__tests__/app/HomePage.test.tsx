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
import { prefetchHomepage } from '@/lib/prefetch';

const stub = (id: string) => () => <div data-testid={id} />;

vi.mock('@/components/home/EagerHomeSections', () => ({ EagerHomeSections: stub('eager') }));
vi.mock('@/components/home/ForYouMixedSection', () => ({ ForYouMixedSection: stub('for-you') }));
vi.mock('@/components/home/RecentProductsSection', () => ({ RecentProductsSection: stub('products') }));
vi.mock('@/components/home/HomeServicesSection', () => ({ HomeServicesSection: stub('services') }));
vi.mock('@/components/home/FeaturedStoresSection', () => ({ FeaturedStoresSection: stub('stores') }));
vi.mock('@/components/home/PromotedProductsSection', () => ({ PromotedProductsSection: stub('promoted') }));
vi.mock('@/components/home/NearbyProvidersSection', () => ({ NearbyProvidersSection: stub('nearby') }));
vi.mock('@/components/home/HomeSafeBuyingTips', () => ({ HomeSafeBuyingTips: stub('tips') }));
vi.mock('@/components/home/HomeBrowseLinks', () => ({ HomeBrowseLinks: stub('browse-links') }));
vi.mock('@/components/home/HomeGuestPublishBar', () => ({ HomeGuestPublishBar: stub('guest-bar') }));
vi.mock('@/components/shared/LazySection', () => ({
  LazySection: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/prefetch', () => ({ prefetchHomepage: vi.fn().mockResolvedValue(undefined) }));

describe('HomePageContent', () => {
  it('renders the above-the-fold block, every rail, and the footer helpers', () => {
    render(<HomePageContent />);
    for (const id of [
      'eager', 'for-you', 'products', 'services', 'stores',
      'promoted', 'nearby', 'tips', 'browse-links', 'guest-bar',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('keeps the documented section order', () => {
    render(<HomePageContent />);
    const order = ['eager', 'for-you', 'products', 'services', 'stores', 'promoted', 'nearby'];
    const nodes = order.map((id) => screen.getByTestId(id));
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

    expect(prefetchHomepage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('eager')).toBeInTheDocument();
    expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
  });
});
