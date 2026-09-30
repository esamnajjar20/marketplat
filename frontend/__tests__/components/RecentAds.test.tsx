/**
 * RecentAds — homepage organic ads rail (useAdsForHome, AdCard compact).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecentAds } from '@/components/home/RecentAds';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import type { AdListItem } from '@/types/ad.types';

vi.mock('@/hooks/queries/useAdsForHome', () => ({
  useAdsForHome: vi.fn(),
}));

vi.mock('@/hooks/useBrowseCity', () => ({
  useBrowseCity: vi.fn(),
}));

vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({
    ad,
    density,
  }: {
    ad: AdListItem;
    density?: string;
  }) => (
    <div data-testid={`ad-card-${ad.id}`} data-density={density ?? 'default'}>
      {ad.title}
    </div>
  ),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

const mockUseAdsForHome = vi.mocked(useAdsForHome);
const mockUseBrowseCity = vi.mocked(useBrowseCity);

function mockAuth(isAuthenticated: boolean) {
  vi.mocked(useAuthStore).mockImplementation((selector: unknown) =>
    (selector as (s: { isAuthenticated: boolean }) => unknown)({ isAuthenticated }),
  );
}

function makeAd(overrides: Partial<AdListItem> = {}): AdListItem {
  return {
    id: overrides.id ?? 'ad-1',
    title: overrides.title ?? 'إعلان',
    isFeatured: false,
    images: [],
    status: 'ACTIVE',
    ...overrides,
  } as AdListItem;
}

describe('RecentAds', () => {
  beforeEach(() => {
    mockAuth(true);
    mockUseBrowseCity.mockReturnValue({
      city: undefined,
      canChange: true,
      setCity: vi.fn(),
      isReady: true,
      source: 'guest',
    } as never);
  });

  it('renders a skeleton rail while loading (no cards)', () => {
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: true,
      isError: false,
      source: 'general',
      items: { kind: 'ads', data: [] },
    } as never);
    const { container } = render(<RecentAds />);
    expect(container.querySelectorAll('[data-testid^="ad-card-"]')).toHaveLength(0);
  });

  it('renders compact AdCards for organic ads', () => {
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: false,
      isError: false,
      source: 'city',
      items: {
        kind: 'ads',
        data: [makeAd({ id: 'a1', title: 'أول' }), makeAd({ id: 'a2', title: 'ثاني' })],
      },
    } as never);
    render(<RecentAds />);
    expect(screen.getByTestId('ad-card-a1')).toHaveAttribute('data-density', 'compact');
    expect(screen.getByTestId('ad-card-a2')).toBeInTheDocument();
  });

  it('shows publish CTA when authenticated and list is empty', () => {
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: false,
      isError: false,
      source: 'general',
      items: { kind: 'ads', data: [] },
    } as never);
    render(<RecentAds />);
    expect(screen.getByText('لا توجد إعلانات بعد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /نشر إعلان/ })).toHaveAttribute(
      'href',
      ROUTES.adCreate,
    );
  });

  it('shows login CTA when unauthenticated and list is empty', () => {
    mockAuth(false);
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: false,
      isError: false,
      source: 'general',
      items: { kind: 'ads', data: [] },
    } as never);
    render(<RecentAds />);
    expect(screen.getByRole('link', { name: /تسجيل الدخول/ })).toBeInTheDocument();
  });

  it('offers clear-city action when a city filter yields no ads', () => {
    const setCity = vi.fn();
    mockUseBrowseCity.mockReturnValue({
      city: 'خانيونس',
      canChange: true,
      setCity,
      isReady: true,
      source: 'guest',
    } as never);
    mockUseAdsForHome.mockReturnValue({
      isChecking: false,
      isLoading: false,
      isError: false,
      source: 'city',
      items: { kind: 'ads', data: [] },
    } as never);
    render(<RecentAds />);
    expect(screen.getByText(/لا إعلانات في خانيونس/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /عرض كل غزة/ }));
    expect(setCity).toHaveBeenCalledWith(undefined);
  });
});
