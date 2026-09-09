/**
 * AdminFraudTable — review queue for flagged ads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminFraudTable } from '@/components/admin/AdminFraudTable';
import { useAdminFlaggedAds, useAdminFraudSignals } from '@/hooks/queries/useAdmin';
import {
  useAdminClearFraudFlag,
  useAdminManualFraudFlag,
  useAdminReviewFraudSignal,
} from '@/hooks/mutations/useAdminMutations';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminFlaggedAds: vi.fn(),
  useAdminFraudSignals: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminClearFraudFlag: vi.fn(),
  useAdminManualFraudFlag: vi.fn(),
  useAdminReviewFraudSignal: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/fraud',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const flaggedAd = {
  id: 'ad-1',
  title: 'إعلان مشبوه',
  price: 100,
  riskScore: 75,
  createdAt: new Date().toISOString(),
  user: { id: 'u1', name: 'بائع' },
};

describe('AdminFraudTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAdminClearFraudFlag as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    });
    (useAdminManualFraudFlag as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    (useAdminReviewFraudSignal as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    });
    (useAdminFraudSignals as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('shows empty state when there are no flagged ads', () => {
    (useAdminFlaggedAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AdminFraudTable />);
    expect(screen.getByText('لا توجد إعلانات موسومة حالياً')).toBeInTheDocument();
  });

  it('renders flagged ad title and risk score', () => {
    (useAdminFlaggedAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [flaggedAd], meta: { totalPages: 1 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AdminFraudTable />);
    expect(screen.getAllByText('إعلان مشبوه').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('75').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('بائع').length).toBeGreaterThanOrEqual(1);
  });

  it('shows action buttons for clear and manual flag', () => {
    (useAdminFlaggedAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [flaggedAd], meta: { totalPages: 1 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AdminFraudTable />);
    expect(screen.getAllByRole('button', { name: /إعلان سليم|سليم/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /علامة يدوية|وسم/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /الإشارات|إشارات/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('expands signals panel on click', async () => {
    (useAdminFlaggedAds as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [flaggedAd], meta: { totalPages: 1 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    (useAdminFraudSignals as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: [
          {
            id: 'sig-1',
            type: 'SUSPICIOUS_PRICE',
            weight: 30,
            reviewed: false,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const user = setupUser();
    render(<AdminFraudTable />);
    await user.click(screen.getAllByRole('button', { name: /الإشارات|إشارات/ })[0]);

    expect(useAdminFraudSignals).toHaveBeenCalledWith(
      expect.objectContaining({ adId: 'ad-1' }),
    );
    // Table renders a mobile-card view and a desktop-table view of the
    // same data simultaneously (one hidden via responsive classes), so
    // the signal label appears twice in the DOM.
    expect(screen.getAllByText('سعر مشبوه').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /تأكيد المراجعة/ }).length).toBeGreaterThanOrEqual(1);
  });
});
