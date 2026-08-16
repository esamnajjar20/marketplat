/**
 * __tests__/components/AdminRecentActivity.test.tsx
 *
 * Real logic under test: loading spinner, error state with retry
 * (must NOT collapse into the empty state — UX-FIX P1-9 admin
 * variant), empty state, list rendering with a fallback of '—' when
 * ad.user is missing, and the ad-detail link href.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminRecentActivity } from '@/components/admin/AdminRecentActivity';
import { useAdminAds } from '@/hooks/queries/useAdmin';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminAds: vi.fn(),
}));

const mockUseAdminAds = vi.mocked(useAdminAds);

function makeAd(overrides: Partial<{
  id: string; title: string; user: { name: string } | null; createdAt: string;
}> = {}) {
  return {
    id: 'ad-1',
    title: 'إعلان تجريبي',
    user: { name: 'أحمد' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AdminRecentActivity', () => {
  it('shows a loading spinner while fetching', () => {
    mockUseAdminAds.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() } as never);
    render(<AdminRecentActivity />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry, not the empty state', async () => {
    const refetch = vi.fn();
    mockUseAdminAds.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch } as never);
    const user = setupUser();
    render(<AdminRecentActivity />);

    expect(screen.getByText('حدث خطأ أثناء تحميل النشاط الأخير')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد نشاطات')).not.toBeInTheDocument();

    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no ads', () => {
    mockUseAdminAds.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() } as never);
    render(<AdminRecentActivity />);
    expect(screen.getByText('لا توجد نشاطات')).toBeInTheDocument();
  });

  it('renders each ad with its title, user name, and a link to the ad detail page', () => {
    mockUseAdminAds.mockReturnValue({
      data: { items: [makeAd({ id: 'ad-42', title: 'دراجة للبيع', user: { name: 'سارة' } })] },
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<AdminRecentActivity />);

    const link = screen.getByText('دراجة للبيع');
    expect(link.closest('a')).toHaveAttribute('href', '/ads/ad-42');
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
    expect(screen.getByText('سارة')).toBeInTheDocument();
  });

  it('falls back to "—" when the ad has no user', () => {
    mockUseAdminAds.mockReturnValue({
      data: { items: [makeAd({ user: null })] },
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<AdminRecentActivity />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('handles a missing data object by treating items as empty', () => {
    mockUseAdminAds.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as never);
    render(<AdminRecentActivity />);
    expect(screen.getByText('لا توجد نشاطات')).toBeInTheDocument();
  });
});
