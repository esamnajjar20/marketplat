/**
 * __tests__/components/DashboardStats.test.tsx
 *
 * FIX BUG-06/BUG-07 (superseded): DashboardStats no longer aggregates
 * raw ad/favorite lists client-side — it renders whatever
 * GET /ads/me/stats (via useMyAdStats) returns directly. The
 * off-by-one/wrong-filter risk this test used to guard against moved
 * server-side, to ads.repository.ts's getStatsByUserId and
 * favorites.repository.ts's countByUserId — this test now only checks
 * loading/error/render-mapping behavior, which is where the risk
 * actually remains on the frontend.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardStats } from '@/components/profile/DashboardStats';
import { useMyAdStats } from '@/hooks/queries/useAds';

vi.mock('@/hooks/queries/useAds', () => ({
  useMyAdStats: vi.fn(),
}));

const mockUseMyAdStats = vi.mocked(useMyAdStats);

describe('DashboardStats', () => {
  it('shows a loading spinner while stats are loading', () => {
    mockUseMyAdStats.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() } as never);
    const { container } = render(<DashboardStats />);

    expect(container.querySelector('.py-8')).toBeInTheDocument();
    expect(screen.queryByText('الإعلانات النشطة')).not.toBeInTheDocument();
  });

  it('shows an error state with retry when the stats query fails, instead of rendering zeros silently', () => {
    const refetch = vi.fn();
    mockUseMyAdStats.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch } as never);
    render(<DashboardStats />);

    expect(screen.getByText('حدث خطأ أثناء تحميل الإحصائيات')).toBeInTheDocument();
    expect(screen.queryByText('الإعلانات النشطة')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders each stat card with its corresponding value from the API response', () => {
    mockUseMyAdStats.mockReturnValue({
      data: { activeAds: 4, soldAds: 2, totalViews: 137, favoritesCount: 9 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<DashboardStats />);

    expect(screen.getByText('الإعلانات النشطة').closest('div')).toHaveTextContent((4).toLocaleString('ar'));
    expect(screen.getByText('إعلانات تم بيعها').closest('div')).toHaveTextContent((2).toLocaleString('ar'));
    expect(screen.getByText('إجمالي المشاهدات').closest('div')).toHaveTextContent((137).toLocaleString('ar'));
    expect(screen.getByText('المفضلة').closest('div')).toHaveTextContent((9).toLocaleString('ar'));
  });

  it('defaults every stat to 0 when the query resolves with no data', () => {
    mockUseMyAdStats.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as never);
    render(<DashboardStats />);

    expect(screen.getByText('الإعلانات النشطة')).toBeInTheDocument();
    const activeCard = screen.getByText('الإعلانات النشطة').closest('div');
    expect(activeCard).toHaveTextContent((0).toLocaleString('ar'));
  });

  // Guards against the exact class of bug BUG-06/BUG-07 were: a stat
  // silently correct only up to some hidden page-size ceiling. With no
  // client-side list/reduce left in this component at all, there is no
  // ceiling to regress to — this just documents that expectation.
  it('renders correctly for counts well beyond the old 100-item page-size ceiling', () => {
    mockUseMyAdStats.mockReturnValue({
      data: { activeAds: 430, soldAds: 215, totalViews: 98_000, favoritesCount: 640 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<DashboardStats />);

    expect(screen.getByText('الإعلانات النشطة').closest('div')).toHaveTextContent((430).toLocaleString('ar'));
    expect(screen.getByText('إعلانات تم بيعها').closest('div')).toHaveTextContent((215).toLocaleString('ar'));
    expect(screen.getByText('إجمالي المشاهدات').closest('div')).toHaveTextContent((98_000).toLocaleString('ar'));
    expect(screen.getByText('المفضلة').closest('div')).toHaveTextContent((640).toLocaleString('ar'));
  });
});
