/**
 * RECS-MIXED-01: the home shelf must cost ONE request for a signed-in
 * visitor (type=mixed) and keep reading the /home-seeded per-type keys
 * for a guest. Verified through each hook's `enabled` flag — the only
 * thing that decides whether a request can leave the browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  isAuth: false,
  mixed: vi.fn(),
  ads: vi.fn(),
  products: vi.fn(),
  services: vi.fn(),
  fbAds: vi.fn(),
  fbProducts: vi.fn(),
  fbServices: vi.fn(),
}));

vi.mock('@/hooks/queries/useRecommendations', () => ({
  useMixedRecommendations: mocks.mixed,
  useRecommendations: mocks.ads,
  useProductRecommendations: mocks.products,
  useServiceRecommendations: mocks.services,
}));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({}),
  selectIsAuthenticated: () => mocks.isAuth,
  selectIsHydrated: () => true,
}));
vi.mock('@/hooks/useBrowseCity', () => ({
  useBrowseCity: () => ({ city: 'غزة', isReady: true }),
}));
vi.mock('@/lib/useDataSaver', () => ({ useDataSaver: () => false }));
vi.mock('@/hooks/queries/useAds', () => ({ useAds: mocks.fbAds }));
vi.mock('@/hooks/queries/useProducts', () => ({ useProducts: mocks.fbProducts }));
vi.mock('@/hooks/queries/useServiceListings', () => ({ useServiceListings: mocks.fbServices }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad }: { ad: { id: string } }) => <div data-testid="card">{`ad-${ad.id}`}</div>,
}));
vi.mock('@/components/stores/ProductCard', () => ({
  ProductCard: ({ product }: { product: { id: string } }) => (
    <div data-testid="card">{`product-${product.id}`}</div>
  ),
}));
vi.mock('@/components/services/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { id: string } }) => (
    <div data-testid="card">{`service-${listing.id}`}</div>
  ),
}));
vi.mock('@/components/home/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock('@/components/home/HomeScrollRail', () => ({
  HomeScrollRail: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HomeScrollRailItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/skeletons/AdCardSkeleton', () => ({
  AdCardSkeleton: () => <div data-testid="skeleton" />,
}));
vi.mock('@/components/shared/feedback/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { ForYouMixedSection } from '@/components/home/ForYouMixedSection';

const query = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mixed.mockReturnValue(query(undefined));
  mocks.ads.mockReturnValue(query(undefined));
  mocks.products.mockReturnValue(query(undefined));
  mocks.services.mockReturnValue(query(undefined));
  for (const fb of [mocks.fbAds, mocks.fbProducts, mocks.fbServices]) {
    fb.mockReturnValue(query(undefined));
  }
});

describe('ForYouMixedSection request count', () => {
  it('signed-in: only the mixed request is enabled (1 request, not 3)', () => {
    mocks.isAuth = true;
    mocks.mixed.mockReturnValue(
      query({ ads: [{ id: 'a1' }], products: [{ id: 'p1' }], services: [{ id: 's1' }] }),
    );
    render(<ForYouMixedSection />);

    expect(mocks.mixed.mock.calls[0]?.[1]).toMatchObject({ enabled: true, scope: 'user' });
    for (const hook of [mocks.ads, mocks.products, mocks.services]) {
      expect(hook.mock.calls[0]?.[1]).toMatchObject({ enabled: false });
    }
    expect(screen.getAllByTestId('card')).toHaveLength(3);
    expect(screen.getByText('مخصص لك')).toBeTruthy();
    // ranked lists are full enough → no organic fallback request is allowed
  });

  it('guest: mixed is disabled; the three /home-seeded keys are read', () => {
    mocks.isAuth = false;
    mocks.ads.mockReturnValue(query([{ id: 'a1' }]));
    mocks.products.mockReturnValue(query([{ id: 'p1' }]));
    mocks.services.mockReturnValue(query([{ id: 's1' }]));
    render(<ForYouMixedSection />);

    expect(mocks.mixed.mock.calls[0]?.[1]).toMatchObject({ enabled: false });
    for (const hook of [mocks.ads, mocks.products, mocks.services]) {
      expect(hook.mock.calls[0]?.[1]).toMatchObject({ enabled: true, scope: 'guest' });
    }
    expect(screen.getAllByTestId('card')).toHaveLength(3);
    expect(screen.getByText('الأكثر رواجًا')).toBeTruthy();
  });

  it('signed-in: a null rail (failed on the server) is just skipped, not an error', () => {
    mocks.isAuth = true;
    mocks.mixed.mockReturnValue(
      query({ ads: [{ id: 'a1' }], products: null, services: null }),
    );
    render(<ForYouMixedSection />);
    expect(screen.getAllByTestId('card')).toHaveLength(1);
    expect(screen.queryByText('تعذّر تحميل الاقتراحات')).toBeNull();
  });

  it('passes the per-type limit and city to the mixed request', () => {
    mocks.isAuth = true;
    render(<ForYouMixedSection />);
    expect(mocks.mixed.mock.calls[0]?.[0]).toEqual({ limit: 12, city: 'غزة' });
  });

  it('shows many cards, mixed across all three types (not only ads)', () => {
    mocks.isAuth = true;
    const mk = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }));
    mocks.mixed.mockReturnValue(
      query({ ads: mk('a', 12), products: mk('p', 12), services: mk('s', 12) }),
    );
    render(<ForYouMixedSection />);
    const texts = screen.getAllByTestId('card').map((c) => c.textContent ?? '');
    expect(texts).toHaveLength(24);
    for (const kind of ['ad-', 'product-', 'service-']) {
      expect(texts.filter((t) => t.startsWith(kind)).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('fallback fetch is enabled only for a type whose ranked list is short', () => {
    mocks.isAuth = true;
    const mk = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }));
    mocks.mixed.mockReturnValue(
      query({ ads: mk('a', 12), products: mk('p', 12), services: mk('s', 2) }),
    );
    render(<ForYouMixedSection />);
    expect(mocks.fbAds.mock.calls[0]?.[1]).toMatchObject({ enabled: false });
    expect(mocks.fbProducts.mock.calls[0]?.[1]).toMatchObject({ enabled: false });
    expect(mocks.fbServices.mock.calls[0]?.[1]).toMatchObject({ enabled: true });
  });
});
