/**
 * __tests__/components/FeaturedAds.test.tsx
 *
 * FeaturedAds's real logic: filters the fetched ads down to
 * isFeatured === true (the API doesn't pre-filter this), renders
 * nothing when there are no featured ads, shows a loading skeleton,
 * and passes priority={true} to only the first two cards (an
 * above-the-fold LCP optimization called out in the component's own
 * comment). AdCard itself is mocked — it has its own dedicated test —
 * so this only asserts on props FeaturedAds is responsible for passing.
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
    isFeatured: overrides.isFeatured ?? false,
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

  it('renders nothing when there are no featured ads among the results', () => {
    mockUseAds.mockReturnValue({
      data: { items: [makeAd({ id: '1', isFeatured: false })] },
      isLoading: false,
    } as never);
    const { container } = render(<FeaturedAds />);

    expect(container).toBeEmptyDOMElement();
  });

  it('filters to only isFeatured ads, excluding non-featured ones', () => {
    mockUseAds.mockReturnValue({
      data: {
        items: [
          makeAd({ id: '1', title: 'مميز', isFeatured: true }),
          makeAd({ id: '2', title: 'عادي', isFeatured: false }),
        ],
      },
      isLoading: false,
    } as never);
    render(<FeaturedAds />);

    expect(screen.getByText('مميز')).toBeInTheDocument();
    expect(screen.queryByText('عادي')).not.toBeInTheDocument();
  });

  it('marks only the first two featured ads as priority', () => {
    mockUseAds.mockReturnValue({
      data: {
        items: [
          makeAd({ id: '1', title: 'أول', isFeatured: true }),
          makeAd({ id: '2', title: 'ثاني', isFeatured: true }),
          makeAd({ id: '3', title: 'ثالث', isFeatured: true }),
        ],
      },
      isLoading: false,
    } as never);
    render(<FeaturedAds />);

    expect(screen.getByTestId('ad-card-1')).toHaveAttribute('data-priority', 'true');
    expect(screen.getByTestId('ad-card-2')).toHaveAttribute('data-priority', 'true');
    expect(screen.getByTestId('ad-card-3')).toHaveAttribute('data-priority', 'false');
  });

  it('handles an empty items array without crashing', () => {
    mockUseAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    const { container } = render(<FeaturedAds />);

    expect(container).toBeEmptyDOMElement();
  });

  // FIX FEAT-06: previously fetched exactly 4 ads and filtered
  // client-side, so with fewer than 4 featured ads among the first 4
  // results (even though more featured ads existed further down the
  // backend's isFeatured-sorted list), the section under-showed or
  // went empty for no real reason.
  describe('fetch window (FIX FEAT-06)', () => {
    it('requests useAds with a limit larger than the 4 cards actually displayed', () => {
      mockUseAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
      render(<FeaturedAds />);

      expect(mockUseAds).toHaveBeenCalledWith(
        expect.objectContaining({ limit: expect.any(Number) }),
      );
      const [[calledWith]] = mockUseAds.mock.calls;
      expect((calledWith as { limit: number }).limit).toBeGreaterThan(4);
    });

    it('finds a featured ad that is not among the first 4 results', () => {
      const items = [
        makeAd({ id: '1', title: 'غير مميز 1', isFeatured: false }),
        makeAd({ id: '2', title: 'غير مميز 2', isFeatured: false }),
        makeAd({ id: '3', title: 'غير مميز 3', isFeatured: false }),
        makeAd({ id: '4', title: 'غير مميز 4', isFeatured: false }),
        makeAd({ id: '5', title: 'مميز متأخر', isFeatured: true }),
      ];
      mockUseAds.mockReturnValue({ data: { items }, isLoading: false } as never);
      render(<FeaturedAds />);

      expect(screen.getByText('مميز متأخر')).toBeInTheDocument();
    });

    it('still caps the displayed cards at 4 even when more featured ads are found', () => {
      const items = Array.from({ length: 8 }, (_, i) =>
        makeAd({ id: `${i}`, title: `مميز ${i}`, isFeatured: true }),
      );
      mockUseAds.mockReturnValue({ data: { items }, isLoading: false } as never);
      const { container } = render(<FeaturedAds />);

      expect(container.querySelectorAll('[data-testid^="ad-card-"]')).toHaveLength(4);
    });
  });
});
