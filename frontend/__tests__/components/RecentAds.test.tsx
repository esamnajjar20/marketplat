/**
 * __tests__/components/RecentAds.test.tsx
 *
 * RecentAds's real logic: loading skeleton, renders all fetched ads
 * (no featured-only filtering, unlike FeaturedAds), calls useAds with
 * the correct sort params (createdAt desc, limit 8), and always renders
 * the "عرض جميع الإعلانات" link to /search — even with zero results,
 * unlike FeaturedAds which renders null when empty.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentAds } from '@/components/home/RecentAds';
import { useAds } from '@/hooks/queries/useAds';
import { ROUTES } from '@/lib/constants';
import type { Ad } from '@/types/ad.types';

vi.mock('@/hooks/queries/useAds', () => ({
  useAds: vi.fn(),
}));

vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad }: { ad: Ad }) => <div data-testid={`ad-card-${ad.id}`}>{ad.title}</div>,
}));

const mockUseAds = vi.mocked(useAds);

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

  it('still renders the "view all" link when there are zero results (unlike FeaturedAds, which renders null)', () => {
    mockUseAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<RecentAds />);

    expect(screen.getByText('عرض جميع الإعلانات')).toBeInTheDocument();
  });
});
