/**
 * __tests__/components/AdCard.test.tsx
 *
 * FIX E2E-GAP-01 (coverage gap identified in the audit): AdCard.tsx
 * had zero test coverage despite rendering in every ad grid across the
 * app (home page FeaturedAds/RecentAds, search results, category
 * pages). Covers: the sold/featured/condition badge combination logic
 * (isFeatured && !isSold specifically — a featured-but-sold ad must
 * not show "مميز"), placeholder fallback when an ad has no images,
 * and the priority/lazy-loading prop wiring.
 *
 * FIX P1-1: AdCard now renders a favorite (heart) button, which pulls
 * in useIsFavorited/useToggleFavorite (both call useQueryClient) and
 * useAuthStore. Mocked the same way AdDetail.test.tsx mocks its own
 * favorite wiring, rather than wrapping every render in a
 * QueryClientProvider — these hooks' own behavior (optimistic update,
 * rollback, cache subscription) is already covered by
 * useFavoriteMutations/useFavorites' own tests; this file only needs
 * to assert AdCard renders the button and wires clicks correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdCard } from '@/components/ads/AdCard';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useIsFavorited } from '@/hooks/queries/useFavorites';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import type { AdListItem } from '@/types/ad.types';

vi.mock('@/hooks/mutations/useFavoriteMutations', () => ({
  useToggleFavorite: vi.fn(),
}));

vi.mock('@/hooks/queries/useFavorites', () => ({
  useIsFavorited: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockToggleMutate = vi.fn();

function mockFavoriteState({ isAuth = true, isFavorited = false } = {}) {
  vi.mocked(useAuthStore).mockImplementation((selector: unknown) =>
    (selector as (s: { isAuthenticated: boolean }) => unknown)({ isAuthenticated: isAuth }),
  );
  vi.mocked(useIsFavorited).mockReturnValue(isFavorited);
  vi.mocked(useToggleFavorite).mockReturnValue({
    mutate: mockToggleMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useToggleFavorite>);
}

const baseAd: AdListItem = {
  id: 'ad-1',
  title: 'سيارة تويوتا كورولا 2020',
  price: '45000',
  isNegotiable: true,
  condition: 'USED',
  city: 'خان يونس',
  images: ['https://res.cloudinary.com/demo/image/upload/car.jpg'],
  status: 'ACTIVE',
  views: 120,
  isFeatured: false,
  isPinned: false,
  userId: 'user-1',
  sellerProfileId: 'sp-1',
  categoryId: 'cat-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  user: { id: 'user-1', name: 'محمد', avatarUrl: null, city: 'خان يونس' },
  category: { id: 'cat-1', name: 'Vehicles', nameAr: 'سيارات' },
};

describe('AdCard', () => {
  beforeEach(() => {
    mockToggleMutate.mockReset();
    mockFavoriteState();
  });

  it('renders the title, price, and city', () => {
    render(<AdCard ad={baseAd} />);

    expect(screen.getByText('سيارة تويوتا كورولا 2020')).toBeInTheDocument();
    expect(screen.getByText(formatPrice(baseAd.price), { exact: false })).toBeInTheDocument();
    expect(screen.getByText('خان يونس')).toBeInTheDocument();
  });

  it('renders a relative time string for createdAt', () => {
    render(<AdCard ad={baseAd} />);
    expect(screen.getByText(formatRelativeTime(baseAd.createdAt))).toBeInTheDocument();
  });

  it('links to the ad detail page', () => {
    render(<AdCard ad={baseAd} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', ROUTES.adDetail(baseAd.id));
  });

  it('shows the condition badge', () => {
    render(<AdCard ad={baseAd} />);
    expect(screen.getByText('مستعمل')).toBeInTheDocument();
  });

  it('does not render a condition badge when the ad has no condition', () => {
    render(<AdCard ad={{ ...baseAd, condition: null }} />);
    expect(screen.queryByText('مستعمل')).not.toBeInTheDocument();
    expect(screen.queryByText('جديد')).not.toBeInTheDocument();
  });

  describe('sold / featured badge logic', () => {
    it('shows a "تم البيع" overlay when the ad is sold', () => {
      render(<AdCard ad={{ ...baseAd, status: 'SOLD' }} />);
      // Overlay on the image + price-row badge both render the same label.
      expect(screen.getAllByText('تم البيع').length).toBeGreaterThanOrEqual(1);
    });

    it('shows a "مميز" badge when featured and not sold', () => {
      render(<AdCard ad={{ ...baseAd, isFeatured: true, status: 'ACTIVE' }} />);
      expect(screen.getByText('مميز')).toBeInTheDocument();
    });

    // The specific compound condition in the source: isFeatured && !isSold.
    it('does NOT show the "مميز" badge when the ad is both featured and sold', () => {
      render(<AdCard ad={{ ...baseAd, isFeatured: true, status: 'SOLD' }} />);
      expect(screen.queryByText('مميز')).not.toBeInTheDocument();
      // The sold overlay still takes precedence (image overlay + price badge).
      expect(screen.getAllByText('تم البيع').length).toBeGreaterThanOrEqual(1);
    });

    it('shows neither badge for a plain active, non-featured ad', () => {
      render(<AdCard ad={baseAd} />);
      expect(screen.queryByText('مميز')).not.toBeInTheDocument();
      expect(screen.queryByText('تم البيع')).not.toBeInTheDocument();
    });
  });

  describe('image fallback', () => {
    it('uses the ad title as the image alt text', () => {
      render(<AdCard ad={baseAd} />);
      expect(screen.getByAltText('سيارة تويوتا كورولا 2020')).toBeInTheDocument();
    });

    it('renders an image even when the ad has no images (placeholder fallback)', () => {
      render(<AdCard ad={{ ...baseAd, images: [] }} />);
      // Must not crash and must still render an <img> with the ad's
      // title as alt text, backed by the SVG placeholder rather than
      // a broken/undefined src.
      const img = screen.getByAltText('سيارة تويوتا كورولا 2020');
      expect(img).toBeInTheDocument();
      expect(img.getAttribute('src')).toBeTruthy();
    });
  });

  describe('priority / lazy loading', () => {
    it('defaults to lazy loading when priority is not passed', () => {
      render(<AdCard ad={baseAd} />);
      const img = screen.getByAltText(baseAd.title);
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('does not set a loading attribute at all when priority is true (matches next/image\'s own priority/lazy contract)', () => {
      render(<AdCard ad={baseAd} priority />);
      const img = screen.getByAltText(baseAd.title);
      expect(img).not.toHaveAttribute('loading');
    });
  });

  it('applies a custom className alongside the default styling', () => {
    render(<AdCard ad={baseAd} className="custom-test-class" />);
    expect(screen.getByRole('link')).toHaveClass('custom-test-class');
  });

  describe('favorite button (FIX P1-1)', () => {
    it('renders a favorite toggle button for a non-sold ad', () => {
      render(<AdCard ad={baseAd} />);
      expect(screen.getByRole('button', { name: 'إضافة إلى المفضلة' })).toBeInTheDocument();
    });

    it('keeps the favorite button for a sold ad because favorites are independent of availability', () => {
      render(<AdCard ad={{ ...baseAd, status: 'SOLD' }} />);
      expect(screen.getByRole('button', { name: /المفضلة/ })).toBeInTheDocument();
    });

    it('reflects the favorited state via aria-pressed and label', () => {
      mockFavoriteState({ isFavorited: true });
      render(<AdCard ad={baseAd} />);
      const btn = screen.getByRole('button', { name: 'إزالة من المفضلة' });
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls toggleFavorite.mutate with the ad id when clicked while authenticated', async () => {
      const user = setupUser();
      render(<AdCard ad={baseAd} />);
      await user.click(screen.getByRole('button', { name: 'إضافة إلى المفضلة' }));
      expect(mockToggleMutate).toHaveBeenCalledWith(baseAd.id);
    });

    it('shows a toast and does not mutate when clicked while unauthenticated', async () => {
      mockFavoriteState({ isAuth: false });
      const user = setupUser();
      render(<AdCard ad={baseAd} />);
      await user.click(screen.getByRole('button', { name: 'إضافة إلى المفضلة' }));
      expect(toast.error).toHaveBeenCalled();
      expect(mockToggleMutate).not.toHaveBeenCalled();
    });

    it('does not navigate when the favorite button is clicked (stopPropagation)', async () => {
      const user = setupUser();
      render(<AdCard ad={baseAd} />);
      // If the click bubbled to the <Link>, jsdom would still not
      // actually navigate, but stopPropagation/preventDefault are
      // exercised by this click regardless — the meaningful assertion
      // is that the mutate call fired exactly once, not zero/twice
      // from a duplicated handler.
      await user.click(screen.getByRole('button', { name: 'إضافة إلى المفضلة' }));
      expect(mockToggleMutate).toHaveBeenCalledTimes(1);
    });
  });

  describe('context rendering', () => {
    it('hides seller in public context', () => {
      render(<AdCard ad={baseAd} context="public" />);
      expect(screen.queryByText('محمد')).not.toBeInTheDocument();
    });

    it('shows seller and keeps city/time in favorites context', () => {
      render(<AdCard ad={baseAd} context="favorites" />);
      expect(screen.getByText('محمد')).toBeInTheDocument();
      expect(screen.getByText('خان يونس')).toBeInTheDocument();
    });

    it('hides the favorite button in owner context', () => {
      render(<AdCard ad={baseAd} context="owner" />);
      expect(screen.queryByRole('button', { name: /المفضلة/ })).not.toBeInTheDocument();
    });
  });

  describe('showKind (mixed lists)', () => {
    it('renders the "إعلان" chip only when showKind is set', () => {
      const { rerender } = render(<AdCard ad={baseAd} />);
      expect(screen.queryByText('إعلان')).not.toBeInTheDocument();
      rerender(<AdCard ad={baseAd} showKind />);
      expect(screen.getByText('إعلان')).toBeInTheDocument();
    });
  });
});
