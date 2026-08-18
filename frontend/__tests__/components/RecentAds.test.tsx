/**
 * __tests__/components/RecentAds.test.tsx
 *
 * Phase 4 rewrite: RecentAds now reads useAdsForHome (location-aware:
 * gps → /search results, city/general → /ads results) instead of
 * calling useAds directly. Coverage:
 *  - loading skeleton while useAdsForHome.isLoading
 *  - renders AdCard for `items.kind === 'ads'` (city/general source)
 *  - renders UnifiedResultCard for `items.kind === 'search'` (gps source)
 *  - "عرض جميع الإعلانات" link to /search whenever there's at least one item
 *  - EmptyState with a "publish first ad" CTA when authenticated + zero results
 *  - login-prompt CTA when unauthenticated + zero results (FIX P1-10)
 *
 * AdCard and UnifiedResultCard are both mocked here so this test only
 * exercises RecentAds' own branching logic, not either card's
 * internals (favorite-button hooks, image handling, etc. — covered by
 * their own test files).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentAds } from '@/components/home/RecentAds';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import type { Ad } from '@/types/ad.types';
import type { SearchResult } from '@/types/search.types';

vi.mock('@/hooks/queries/useAdsForHome', () => ({
  useAdsForHome: vi.fn(),
}));

vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad }: { ad: Ad }) => <div data-testid={`ad-card-${ad.id}`}>{ad.title}</div>,
}));

vi.mock('@/components/search/UnifiedResultCard', () => ({
  UnifiedResultCard: ({ result }: { result: SearchResult }) => (
    <div data-testid={`search-card-${result.id}`}>{result.title}</div>
  ),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

const mockUseAdsForHome = vi.mocked(useAdsForHome);

function mockAuth(isAuthenticated: boolean) {
  vi.mocked(useAuthStore).mockImplementation((selector: unknown) =>
    (selector as (s: { isAuthenticated: boolean }) => unknown)({ isAuthenticated }),
  );
}

function makeAd(overrides: Partial<Ad>): Ad {
  return {
    id: overrides.id ?? 'ad-1',
    title: overrides.title ?? 'إعلان',
    isFeatured: false,
    images: [],
    status: 'ACTIVE',
  } as Ad;
}

function makeSearchResult(overrides: Partial<SearchResult>): SearchResult {
  return {
    id: overrides.id ?? 'sr-1',
    type: 'ad',
    title: overrides.title ?? 'نتيجة',
    description: '',
    image: null,
    city: null,
    rating: 0,
    views: 0,
    price: null,
    seller: { id: 's1', name: 'بائع', verified: false, type: 'seller_profile' },
    url: '/ads/sr-1',
    createdAt: new Date().toISOString(),
    distanceKm: 2.5,
    ...overrides,
  };
}

describe('RecentAds', () => {
  beforeEach(() => {
    mockAuth(true);
  });

  it('renders a skeleton grid while loading (no cards of either kind)', () => {
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: true,
      isError: false,
      source: 'general',
      items: { kind: 'ads', data: [] },
    } as never);
    const { container } = render(<RecentAds />);

    expect(container.querySelectorAll('[data-testid^="ad-card-"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid^="search-card-"]')).toHaveLength(0);
  });

  it('renders AdCard for items.kind === "ads" (city/general source)', () => {
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: false,
      isError: false,
      source: 'general',
      items: { kind: 'ads', data: [makeAd({ id: '1', title: 'أول' }), makeAd({ id: '2', title: 'ثاني' })] },
    } as never);
    render(<RecentAds />);

    expect(screen.getByText('أول')).toBeInTheDocument();
    expect(screen.getByText('ثاني')).toBeInTheDocument();
  });

  it('renders UnifiedResultCard for items.kind === "search" (gps source)', () => {
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: false,
      isError: false,
      source: 'gps',
      items: { kind: 'search', data: [makeSearchResult({ id: 's1', title: 'قريب مني' })] },
    } as never);
    render(<RecentAds />);

    expect(screen.getByTestId('search-card-s1')).toBeInTheDocument();
    expect(screen.getByText('قريب مني')).toBeInTheDocument();
    expect(screen.queryByTestId(/^ad-card-/)).not.toBeInTheDocument();
  });

  it('renders the "view all" link to /search whenever there is at least one item', () => {
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: false,
      isError: false,
      source: 'general',
      items: { kind: 'ads', data: [makeAd({ id: '1' })] },
    } as never);
    render(<RecentAds />);

    const link = screen.getByText('عرض جميع الإعلانات').closest('a');
    expect(link).toHaveAttribute('href', ROUTES.search);
  });

  it('shows an EmptyState with a "publish first ad" CTA for an authenticated user with zero results (home page §1 fix)', () => {
    mockAuth(true);
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: false,
      isError: false,
      source: 'general',
      items: { kind: 'ads', data: [] },
    } as never);
    render(<RecentAds />);

    expect(screen.getByText('لا توجد إعلانات بعد')).toBeInTheDocument();
    expect(screen.getByText('نشر إعلان مجاناً').closest('a')).toHaveAttribute('href', ROUTES.adCreate);
    expect(screen.queryByText('عرض جميع الإعلانات')).not.toBeInTheDocument();
  });

  it('shows a login prompt instead of the publish CTA for an unauthenticated visitor with zero results (FIX P1-10)', () => {
    mockAuth(false);
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: false,
      isError: false,
      source: 'general',
      items: { kind: 'ads', data: [] },
    } as never);
    render(<RecentAds />);

    expect(screen.getByText('لا توجد إعلانات بعد')).toBeInTheDocument();
    expect(screen.queryByText('نشر إعلان مجاناً')).not.toBeInTheDocument();
    const loginLink = screen.getByText(/^تسجيل الدخول/).closest('a');
    expect(loginLink).toHaveAttribute(
      'href',
      `${ROUTES.login}?from=${encodeURIComponent(ROUTES.adCreate)}`,
    );
  });
});
