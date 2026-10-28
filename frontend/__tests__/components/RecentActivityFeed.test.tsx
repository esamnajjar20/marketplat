/**
 * __tests__/components/RecentActivityFeed.test.tsx
 *
 * Rewritten against the current component: RecentActivityFeed now
 * renders real UserActivity rows via useMyActivity({ limit: 8 }), not
 * "last 5 ads" via useMyAds — the previous version of this file mocked
 * the wrong hook entirely (useMyAds, which the component no longer
 * imports) and asserted on fields/behavior (status label, price, a
 * total>5 "show all" threshold) that don't exist on this component
 * anymore. Covers loading, 's error-before-empty ordering
 * (a failed fetch must not surface the "publish your first ad" prompt
 * meant for genuinely-new sellers), the true empty state with its
 * create-ad link, per-item rendering (title, description, relative
 * time), and the always-present "عرض سجل النشاط كاملاً" link to the
 * full timeline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { RecentActivityFeed } from '@/components/profile/RecentActivityFeed';
import { useMyActivity } from '@/hooks/queries/useActivity';

vi.mock('@/hooks/queries/useActivity', () => ({
  useMyActivity: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockRefetch = vi.fn();
const activity = {
  id: 'act-1',
  userId: 'user-1',
  type: 'AD_CREATED' as const,
  title: 'ثلاجة سامسونج',
  description: 'تم نشر الإعلان',
  entityType: 'AD' as const,
  entityId: 'ad-1',
  metadata: null,
  createdAt: '2026-08-10T00:00:00.000Z',
};

function mockActivity(overrides: Record<string, unknown> = {}) {
  (useMyActivity as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [activity], meta: { total: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('RecentActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActivity();
  });

  it('shows a spinner while loading, not the empty state', () => {
    mockActivity({ data: undefined, isLoading: true });
    render(<RecentActivityFeed />);

    expect(screen.queryByText('لا يوجد نشاط بعد.')).not.toBeInTheDocument();
  });

  it('shows an error message with retry, not the "publish first ad" empty state, on failure', async () => {
    mockActivity({ data: undefined, isError: true });
    const user = setupUser();
    render(<RecentActivityFeed />);

    expect(screen.getByText('حدث خطأ أثناء تحميل النشاط الأخير')).toBeInTheDocument();
    expect(screen.queryByText('انشر أول إعلان')).not.toBeInTheDocument();

    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows a "publish first ad" prompt when there is genuinely no activity yet', () => {
    mockActivity({ data: { items: [], meta: { total: 0 } } });
    render(<RecentActivityFeed />);

    expect(screen.getByText('انشر أول إعلان')).toBeInTheDocument();
  });

  it('renders each activity row with its title and description+time line', () => {
    render(<RecentActivityFeed />);

    expect(screen.getByText('ثلاجة سامسونج')).toBeInTheDocument();
    expect(screen.getByText(/تم نشر الإعلان/)).toBeInTheDocument();
  });

  it('links a row with an entityId/entityType to the matching detail route', () => {
    render(<RecentActivityFeed />);

    expect(screen.getByText('ثلاجة سامسونج').closest('a')).toHaveAttribute('href', '/ads/ad-1');
  });

  it('renders a row with no entityId as plain (non-link) content', () => {
    mockActivity({
      data: { items: [{ ...activity, entityType: null, entityId: null }], meta: { total: 1 } },
    });
    render(<RecentActivityFeed />);

    expect(screen.getByText('ثلاجة سامسونج').closest('a')).toBeNull();
  });

  it('always shows "عرض سجل النشاط كاملاً" linking to the full activity timeline', () => {
    render(<RecentActivityFeed />);

    expect(screen.getByText('عرض سجل النشاط كاملاً').closest('a')).toHaveAttribute('href', '/activity');
  });
});
