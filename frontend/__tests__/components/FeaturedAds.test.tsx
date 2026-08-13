/**
 * __tests__/components/FeaturedAds.test.tsx
 *
 * FIX FEAT-06 (superseded): FeaturedAds no longer over-fetches and
 * filters isFeatured client-side — it asks useAds for isFeatured: true
 * directly, now that the backend accepts that filter server-side (see
 * ads.validation.ts / ads.repository.ts). This test now only checks
 * that FeaturedAds requests the right params and renders whatever
 * useAds returns, plus the loading/empty/priority behavior that's
 * still this component's own responsibility.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeaturedAds } from '@/components/home/FeaturedAds';
import { useAds } from '@/hooks/queries/useAds';
import type { Ad } from '@/types/ad.types';

vi.mock('@/hooks/queries/useAds', () => ({
  useAds: vi.fn(),
}));

vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad, priority }: { ad: Ad; priority?: boolean }) => (
    <div data-testid={`ad-card-${ad.id}`} data-priority={String(!!priority)}>
      {ad.title}
    </div>
  ),
}));

const mockUseAds = vi.mocked(useAds);

function makeAd(overrides: Partial<Ad>): Ad {
  return {
    id: overrides.id ?? 'ad-1',
    title: overrides.title ?? 'إعلان',
    isFeatured: overrides.isFeatured ?? true,
    images: overrides.images ?? [],
    status: overrides.status ?? 'ACTIVE',
  } as Ad;
}

describe('FeaturedAds', () => {
  it('renders a skeleton grid while loading', () => {
    mockUseAds.mockReturnValue({ data: undefined, isLoading: true } as never);
    const { container } = render(<FeaturedAds />);

    expect(container.querySelectorAll('[data-testid^="ad-card-"]')).toHaveLength(0);
  });

  it('renders nothing when the backend returns no featured ads', () => {
    mockUseAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    const { container } = render(<FeaturedAds />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders every ad the backend returns (no client-side isFeatured re-filtering)', () => {
    mockUseAds.mockReturnValue({
      data: {
        items: [
          makeAd({ id: '1', title: 'مميز أول' }),
          makeAd({ id: '2', title: 'مميز ثاني' }),
        ],
      },
      isLoading: false,
    } as never);
    render(<FeaturedAds />);

    expect(screen.getByText('مميز أول')).toBeInTheDocument();
    expect(screen.getByText('مميز ثاني')).toBeInTheDocument();
  });

  it('marks only the first two ads as priority', () => {
    mockUseAds.mockReturnValue({
      data: {
        items: [
          makeAd({ id: '1', title: 'أول' }),
          makeAd({ id: '2', title: 'ثاني' }),
          makeAd({ id: '3', title: 'ثالث' }),
        ],
      },
      isLoading: false,
    } as never);
    render(<FeaturedAds />);

    expect(screen.getByTestId('ad-card-1')).toHaveAttribute('data-priority', 'true');
    expect(screen.getByTestId('ad-card-2')).toHaveAttribute('data-priority', 'true');
    expect(screen.getByTestId('ad-card-3')).toHaveAttribute('data-priority', 'false');
  });

  // FIX FEAT-06: the fix itself — request isFeatured: true server-side
  // instead of a wide window to filter client-side. This is the one
  // assertion that actually guards against the original bug (a
  // marketplace grown past a small over-fetch window silently losing
  // featured ads that existed further down the sorted list).
  it('requests useAds with isFeatured: true and limit matching the display count', () => {
    mockUseAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<FeaturedAds />);

    expect(mockUseAds).toHaveBeenCalledWith(
      expect.objectContaining({ isFeatured: true, limit: 4 }),
    );
  });

  it('handles an empty items array without crashing', () => {
    mockUseAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    const { container } = render(<FeaturedAds />);

    expect(container).toBeEmptyDOMElement();
  });
});
