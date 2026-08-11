/**
 * __tests__/components/RecentAds.test.tsx
 *
 * RecentAds's real logic: loading skeleton, renders all fetched ads
 * (no featured-only filtering, unlike FeaturedAds), calls useAds with
 * the correct sort params (createdAt desc, limit 8), and renders the
 * "عرض جميع الإعلانات" link to /search whenever there's at least one
 * ad. On zero results it shows an EmptyState with a "publish your
 * first ad" CTA instead (home page §1 audit fix) rather than an empty
 * grid with a dangling "view all" link.
 *
 * FIX P1-1: AdCard is mocked here too, so it no longer pulls in the
 * favorite-button hooks (useIsFavorited/useToggleFavorite/useQueryClient)
 * that require mocking or a QueryClientProvider — see AdCard.test.tsx
 * for that coverage.
 *
 * FIX P1-10: the empty-state CTA now depends on auth status
 * (useAuthStore) — an unauthenticated visitor sees a login prompt
 * instead of a link straight into the protected /ads/create route.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentAds } from '@/components/home/RecentAds';
import { useAds } from '@/hooks/queries/useAds';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import type { Ad } from '@/types/ad.types';

vi.mock('@/hooks/queries/useAds', () => ({
  useAds: vi.fn(),
}));

vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad }: { ad: Ad }) => <div data-testid={`ad-card-${ad.id}`}>{ad.title}</div>,
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

const mockUseAds = vi.mocked(useAds);

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

describe('RecentAds', () => {
  beforeEach(() => {
    mockAuth(true);
  });

  it('calls useAds requesting the 8 most recent ads', () => {
    mockUseAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<RecentAds />);

    expect(mockUseAds).toHaveBeenCalledWith({
      limit: 8,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('renders a skeleton grid while loading', () => {
    mockUseAds.mockReturnValue({ data: undefined, isLoading: true } as never);
    const { container } = render(<RecentAds />);

    expect(container.querySelectorAll('[data-testid^="ad-card-"]')).toHaveLength(0);
  });

  it('renders every fetched ad without any isFeatured filtering', () => {
    mockUseAds.mockReturnValue({
      data: {
        items: [
          makeAd({ id: '1', title: 'أول' }),
          makeAd({ id: '2', title: 'ثاني' }),
        ],
      },
      isLoading: false,
    } as never);
    render(<RecentAds />);

    expect(screen.getByText('أول')).toBeInTheDocument();
    expect(screen.getByText('ثاني')).toBeInTheDocument();
  });

  it('renders the "view all" link to /search even when there are ads', () => {
    mockUseAds.mockReturnValue({
      data: { items: [makeAd({ id: '1' })] },
      isLoading: false,
    } as never);
    render(<RecentAds />);

    const link = screen.getByText('عرض جميع الإعلانات').closest('a');
    expect(link).toHaveAttribute('href', ROUTES.search);
  });

  it('shows an EmptyState with a "publish first ad" CTA for an authenticated user with zero results (home page §1 fix)', () => {
    mockAuth(true);
    mockUseAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<RecentAds />);

    expect(screen.getByText('لا توجد إعلانات بعد')).toBeInTheDocument();
    expect(screen.getByText('نشر إعلان مجاناً').closest('a')).toHaveAttribute('href', ROUTES.adCreate);
    expect(screen.queryByText('عرض جميع الإعلانات')).not.toBeInTheDocument();
  });

  it('shows a login prompt instead of the publish CTA for an unauthenticated visitor with zero results (FIX P1-10)', () => {
    mockAuth(false);
    mockUseAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<RecentAds />);

    expect(screen.getByText('لا توجد إعلانات بعد')).toBeInTheDocument();
    expect(screen.queryByText('نشر إعلان مجاناً')).not.toBeInTheDocument();
    // Actual CTA text is "تسجيل الدخول لنشر إعلان" (full phrase), not the
    // bare "تسجيل الدخول" — match by prefix.
    const loginLink = screen.getByText(/^تسجيل الدخول/).closest('a');
    expect(loginLink).toHaveAttribute(
      'href',
      `${ROUTES.login}?from=${encodeURIComponent(ROUTES.adCreate)}`,
    );
  });
});
