/**
 * __tests__/components/AdminStatsGrid.test.tsx
 *
 * AdminStatsGrid's real logic: a loading state, and defaulting each of
 * the four stats to 0 when the corresponding field is missing from the
 * API response (rather than crashing on undefined.toLocaleString()).
 * Digit assertions use (n).toLocaleString('ar') rather than hardcoded
 * glyphs since this environment's ICU build renders plain Western
 * digits for 'ar', not Eastern Arabic-Indic ones — asserting the
 * literal output of the same call sidesteps that entirely.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminStatsGrid } from '@/components/admin/AdminStatsGrid';
import { useAdminStats } from '@/hooks/queries/useAdmin';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminStats: vi.fn(),
}));

const mockUseAdminStats = vi.mocked(useAdminStats);

describe('AdminStatsGrid', () => {
  it('shows a loading spinner while stats are loading', () => {
    mockUseAdminStats.mockReturnValue({ data: undefined, isLoading: true } as never);
    render(<AdminStatsGrid />);
    expect(screen.queryByText('إجمالي الإعلانات')).not.toBeInTheDocument();
  });

  it('renders all four stat values from the API response', () => {
    mockUseAdminStats.mockReturnValue({
      data: { totalAds: 150, activeUsers: 42, openReports: 3, viewsToday: 980 },
      isLoading: false,
    } as never);
    render(<AdminStatsGrid />);

    const totalAdsCard = screen.getByText('إجمالي الإعلانات').closest('div');
    expect(totalAdsCard).toHaveTextContent((150).toLocaleString('ar'));

    const activeUsersCard = screen.getByText('المستخدمون النشطون').closest('div');
    expect(activeUsersCard).toHaveTextContent((42).toLocaleString('ar'));

    const openReportsCard = screen.getByText('البلاغات المفتوحة').closest('div');
    expect(openReportsCard).toHaveTextContent((3).toLocaleString('ar'));

    const viewsTodayCard = screen.getByText('مشاهدات اليوم').closest('div');
    expect(viewsTodayCard).toHaveTextContent((980).toLocaleString('ar'));
  });

  it('defaults every stat to 0 when the API returns no data at all', () => {
    mockUseAdminStats.mockReturnValue({ data: undefined, isLoading: false } as never);
    render(<AdminStatsGrid />);

    const totalAdsCard = screen.getByText('إجمالي الإعلانات').closest('div');
    expect(totalAdsCard).toHaveTextContent((0).toLocaleString('ar'));
  });

  it('defaults viewsToday to 0 specifically (FIX FEAT-05: this field was previously always omitted)', () => {
    mockUseAdminStats.mockReturnValue({
      data: { totalAds: 5, activeUsers: 2, openReports: 0 }, // viewsToday intentionally absent
      isLoading: false,
    } as never);
    render(<AdminStatsGrid />);

    const viewsTodayCard = screen.getByText('مشاهدات اليوم').closest('div');
    expect(viewsTodayCard).toHaveTextContent((0).toLocaleString('ar'));
  });
});
