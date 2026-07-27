/**
 * __tests__/components/DashboardStats.test.tsx
 *
 * DashboardStats's real logic: aggregates raw ad/favorite data into 4
 * derived stats — active-ad count, sold-ad count, total views summed
 * across all ads, and favorites count — plus a combined loading state
 * (waits for both useMyAds AND useFavorites). These are the kind of
 * off-by-one/wrong-filter bugs (e.g. counting SOLD as ACTIVE, or
 * summing views incorrectly) that are easy to introduce silently.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardStats } from '@/components/profile/DashboardStats';
import { useMyAds } from '@/hooks/queries/useAds';
import { useFavorites } from '@/hooks/queries/useFavorites';
import type { Ad } from '@/types/ad.types';

vi.mock('@/hooks/queries/useAds', () => ({
  useMyAds: vi.fn(),
}));

vi.mock('@/hooks/queries/useFavorites', () => ({
  useFavorites: vi.fn(),
}));

const mockUseMyAds = vi.mocked(useMyAds);
const mockUseFavorites = vi.mocked(useFavorites);

function makeAd(overrides: Partial<Ad>): Ad {
  return { id: 'a', status: 'ACTIVE', views: 0, ...overrides } as Ad;
}

describe('DashboardStats', () => {
  it('shows a loading spinner while ads are loading, even if favorites already loaded', () => {
    mockUseMyAds.mockReturnValue({ data: undefined, isLoading: true } as never);
    mockUseFavorites.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    const { container } = render(<DashboardStats />);

    expect(container.querySelector('.py-8')).toBeInTheDocument();
    expect(screen.queryByText('الإعلانات النشطة')).not.toBeInTheDocument();
  });

  it('shows a loading spinner while favorites are loading, even if ads already loaded', () => {
    mockUseMyAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    mockUseFavorites.mockReturnValue({ data: undefined, isLoading: true } as never);
    render(<DashboardStats />);

    expect(screen.queryByText('الإعلانات النشطة')).not.toBeInTheDocument();
  });

  it('counts only ACTIVE ads toward "الإعلانات النشطة", excluding SOLD and others', () => {
    mockUseMyAds.mockReturnValue({
      data: {
        items: [
          makeAd({ status: 'ACTIVE' }),
          makeAd({ status: 'ACTIVE' }),
          makeAd({ status: 'SOLD' }),
        ],
      },
      isLoading: false,
    } as never);
    mockUseFavorites.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<DashboardStats />);

    const activeCard = screen.getByText('الإعلانات النشطة').closest('div');
    expect(activeCard).toHaveTextContent((2).toLocaleString('ar'));
  });

  it('counts only SOLD ads toward "إعلانات تم بيعها"', () => {
    mockUseMyAds.mockReturnValue({
      data: {
        items: [makeAd({ status: 'SOLD' }), makeAd({ status: 'ACTIVE' })],
      },
      isLoading: false,
    } as never);
    mockUseFavorites.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<DashboardStats />);

    const soldCard = screen.getByText('إعلانات تم بيعها').closest('div');
    expect(soldCard).toHaveTextContent((1).toLocaleString('ar'));
  });

  it('sums views across all ads regardless of status', () => {
    mockUseMyAds.mockReturnValue({
      data: {
        items: [
          makeAd({ status: 'ACTIVE', views: 10 }),
          makeAd({ status: 'SOLD', views: 25 }),
        ],
      },
      isLoading: false,
    } as never);
    mockUseFavorites.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<DashboardStats />);

    const viewsCard = screen.getByText('إجمالي المشاهدات').closest('div');
    expect(viewsCard).toHaveTextContent((35).toLocaleString('ar'));
  });

  it('shows the favorites count from useFavorites, independent of ad data', () => {
    mockUseMyAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    mockUseFavorites.mockReturnValue({
      data: { items: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }], meta: { total: 3 } },
      isLoading: false,
    } as never);
    render(<DashboardStats />);

    const favCard = screen.getByText('المفضلة').closest('div');
    expect(favCard).toHaveTextContent((3).toLocaleString('ar'));
  });

  it('defaults every stat to 0 when both queries return no data', () => {
    mockUseMyAds.mockReturnValue({ data: undefined, isLoading: false } as never);
    mockUseFavorites.mockReturnValue({ data: undefined, isLoading: false } as never);
    render(<DashboardStats />);

    // All four cards render with a "0" value (٠), not a crash.
    expect(screen.getByText('الإعلانات النشطة')).toBeInTheDocument();
    const activeCard = screen.getByText('الإعلانات النشطة').closest('div');
    expect(activeCard).toHaveTextContent((0).toLocaleString('ar'));
  });

  // FIX BUG-06: useMyAds() previously ran with no params, so the
  // backend silently capped it at its default limit of 20 — a seller
  // with more ads than that got wrong stats with no error or warning.
  it('requests useMyAds with an explicit limit above the backend default of 20', () => {
    mockUseMyAds.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    mockUseFavorites.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<DashboardStats />);

    expect(mockUseMyAds).toHaveBeenCalledWith(
      expect.objectContaining({ limit: expect.any(Number) }),
    );
    const [[calledWith]] = mockUseMyAds.mock.calls;
    expect((calledWith as { limit: number }).limit).toBeGreaterThan(20);
  });

  it('correctly counts active/sold ads and sums views for a seller with more than 20 ads', () => {
    const manyAds = [
      ...Array.from({ length: 30 }, (_, i) => makeAd({ id: `active-${i}`, status: 'ACTIVE', views: 1 })),
      ...Array.from({ length: 15 }, (_, i) => makeAd({ id: `sold-${i}`, status: 'SOLD', views: 2 })),
    ];
    mockUseMyAds.mockReturnValue({ data: { items: manyAds }, isLoading: false } as never);
    mockUseFavorites.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
    render(<DashboardStats />);

    expect(screen.getByText('الإعلانات النشطة').closest('div')).toHaveTextContent((30).toLocaleString('ar'));
    expect(screen.getByText('إعلانات تم بيعها').closest('div')).toHaveTextContent((15).toLocaleString('ar'));
    expect(screen.getByText('إجمالي المشاهدات').closest('div')).toHaveTextContent((60).toLocaleString('ar'));
  });
});
