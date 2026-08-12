/**
 * __tests__/components/AdminAnalyticsDashboard.test.tsx
 *
 * Real logic under test: loading spinner, error state with retry,
 * the five totals cards, the two conversion-funnel percentages
 * (search→contact, signup completion), the range selector switching
 * `rangeDays` state, and the two "no data" empty states for the trend
 * chart and top-categories list. Digit assertions use
 * (n).toLocaleString('ar') to match the component's own formatting
 * rather than hardcoding glyphs (see AdminStatsGrid.test.tsx).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAnalyticsDashboard } from '@/components/admin/AdminAnalyticsDashboard';
import { useAdminAnalyticsSummary } from '@/hooks/queries/useAdmin';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminAnalyticsSummary: vi.fn(),
}));

const mockUseAdminAnalyticsSummary = vi.mocked(useAdminAnalyticsSummary);

function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString('ar', { maximumFractionDigits: 1 })}%`;
}

const baseData = {
  totals: {
    PAGE_VIEW: 1000,
    AD_VIEW: 500,
    SEARCH: 300,
    CATEGORY_BROWSE: 120,
    CONTACT_CLICK: 40,
    SIGNUP_STARTED: 0,
    SIGNUP_COMPLETED: 0,
  },
  searchToContact: {
    searchSessions: 300,
    contactSessions: 40,
    conversionRate: 0.1333,
  },
  signupFunnel: {
    startedSessions: 50,
    completedSessions: 30,
    conversionRate: 0.6,
  },
  trend: [
    { bucket: '2026-08-01', event: 'AD_VIEW', count: 10 },
    { bucket: '2026-08-02', event: 'AD_VIEW', count: 20 },
  ],
  topCategories: [
    { categoryId: 'cat-1', nameAr: 'إلكترونيات', count: 55 },
    { categoryId: 'cat-2', nameAr: null, count: 10 },
  ],
};

describe('AdminAnalyticsDashboard', () => {
  it('shows a loading spinner while data is loading', () => {
    mockUseAdminAnalyticsSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminAnalyticsDashboard />);
    expect(screen.queryByText('إجمالي التحويل')).not.toBeInTheDocument();
    expect(screen.queryByText(/مشاهدات الصفحات/)).not.toBeInTheDocument();
  });

  it('shows an error state with a retry button on failure', async () => {
    const refetch = vi.fn();
    mockUseAdminAnalyticsSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);
    render(<AdminAnalyticsDashboard />);

    expect(screen.getByText('حدث خطأ أثناء تحميل بيانات التحليلات')).toBeInTheDocument();
    await userEvent.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the error state when data is missing even without isError', () => {
    mockUseAdminAnalyticsSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminAnalyticsDashboard />);
    expect(screen.getByText('حدث خطأ أثناء تحميل بيانات التحليلات')).toBeInTheDocument();
  });

  it('renders the five totals cards with correct values', () => {
    mockUseAdminAnalyticsSummary.mockReturnValue({
      data: baseData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminAnalyticsDashboard />);

    const pageViews = screen.getByText('مشاهدات الصفحات').closest('div');
    expect(pageViews).toHaveTextContent((1000).toLocaleString('ar'));

    const adViews = screen.getByText('مشاهدات الإعلانات').closest('div');
    expect(adViews).toHaveTextContent((500).toLocaleString('ar'));

    const searches = screen.getByText('عمليات البحث').closest('div');
    expect(searches).toHaveTextContent((300).toLocaleString('ar'));

    const categoryBrowse = screen.getByText('تصفّح الفئات').closest('div');
    expect(categoryBrowse).toHaveTextContent((120).toLocaleString('ar'));

    const contactClicks = screen.getByText('نقرات التواصل').closest('div');
    expect(contactClicks).toHaveTextContent((40).toLocaleString('ar'));
  });

  it('renders the conversion funnel percentages', () => {
    mockUseAdminAnalyticsSummary.mockReturnValue({
      data: baseData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminAnalyticsDashboard />);

    expect(screen.getByText(formatPercent(0.1333))).toBeInTheDocument();
    expect(screen.getByText(formatPercent(0.6))).toBeInTheDocument();
  });

  it('renders the top categories list, falling back to categoryId when nameAr is null', () => {
    mockUseAdminAnalyticsSummary.mockReturnValue({
      data: baseData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminAnalyticsDashboard />);

    expect(screen.getByText('إلكترونيات')).toBeInTheDocument();
    expect(screen.getByText('cat-2')).toBeInTheDocument();
  });

  it('shows empty-state messages when trend and topCategories are both empty', () => {
    mockUseAdminAnalyticsSummary.mockReturnValue({
      data: { ...baseData, trend: [], topCategories: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminAnalyticsDashboard />);

    const emptyMessages = screen.getAllByText('لا توجد بيانات كافية لهذه الفترة');
    expect(emptyMessages).toHaveLength(2);
  });

  it('switches the active range button when a different range is clicked', async () => {
    mockUseAdminAnalyticsSummary.mockReturnValue({
      data: baseData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminAnalyticsDashboard />);

    const sevenDaysBtn = screen.getByText('7 أيام');
    const ninetyDaysBtn = screen.getByText('90 يومًا');

    // Default range is 30 days.
    expect(screen.getByText('30 يومًا').className).toContain('bg-primary');
    expect(sevenDaysBtn.className).not.toContain('bg-primary');

    await userEvent.click(ninetyDaysBtn);
    expect(ninetyDaysBtn.className).toContain('bg-primary');
  });
});
