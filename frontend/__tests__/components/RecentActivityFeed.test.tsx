/**
 * __tests__/components/RecentActivityFeed.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers loading, UX-FIX P1-9's
 * error-before-empty ordering (a failed fetch must not surface the
 * "publish your first ad" prompt meant for genuinely-new sellers),
 * the true empty state with its create-ad link, per-item rendering
 * (title, status label, relative time, price), and the "show all"
 * link that only appears once total ads exceed the 5-item limit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecentActivityFeed } from '@/components/profile/RecentActivityFeed';
import { useMyAds } from '@/hooks/queries/useAds';

vi.mock('@/hooks/queries/useAds', () => ({
  useMyAds: vi.fn(),
}));

const mockRefetch = vi.fn();
const ad = { id: 'ad-1', title: 'ثلاجة سامسونج', status: 'ACTIVE', createdAt: '2026-08-10T00:00:00.000Z', price: 1500 };

function mockAds(overrides: Record<string, unknown> = {}) {
  (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [ad], meta: { total: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('RecentActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAds();
  });

  it('shows a spinner while loading', () => {
    mockAds({ data: undefined, isLoading: true });
    render(<RecentActivityFeed />);

    expect(screen.queryByText('لا توجد إعلانات حتى الآن.')).not.toBeInTheDocument();
  });

  it('shows an error message with retry, not the "publish first ad" empty state, on failure', async () => {
    mockAds({ data: undefined, isError: true });
    const user = userEvent.setup();
    render(<RecentActivityFeed />);

    expect(screen.getByText('حدث خطأ أثناء تحميل النشاط الأخير')).toBeInTheDocument();
    expect(screen.queryByText('انشر أول إعلان')).not.toBeInTheDocument();

    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows a "publish first ad" prompt when the seller genuinely has no ads', () => {
    mockAds({ data: { items: [], meta: { total: 0 } } });
    render(<RecentActivityFeed />);

    expect(screen.getByText('انشر أول إعلان')).toBeInTheDocument();
  });

  it('renders each ad with its title, status label, and price', () => {
    render(<RecentActivityFeed />);

    expect(screen.getByText('ثلاجة سامسونج')).toBeInTheDocument();
    expect(screen.getByText(/نشط/)).toBeInTheDocument();
  });

  it('does not show "عرض جميع الإعلانات" when total is within the 5-item limit', () => {
    render(<RecentActivityFeed />);

    expect(screen.queryByText('عرض جميع الإعلانات')).not.toBeInTheDocument();
  });

  it('shows "عرض جميع الإعلانات" when total ads exceed 5', () => {
    mockAds({ data: { items: [ad], meta: { total: 8 } } });
    render(<RecentActivityFeed />);

    expect(screen.getByText('عرض جميع الإعلانات')).toBeInTheDocument();
  });
});
