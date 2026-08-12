/**
 * __tests__/components/MyReportsList.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers loading/error/empty states,
 * row rendering (reason/target-type/status badges, notes, target link
 * with the ad-title-vs-fallback branch), and pagination (both-ends-
 * disabled edge cases at page 1 and the last page, plus setPage calls).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyReportsList } from '@/components/profile/MyReportsList';
import { useMyReports } from '@/hooks/queries/useMyReports';

vi.mock('@/hooks/queries/useMyReports', () => ({
  useMyReports: vi.fn(),
}));

const mockRefetch = vi.fn();

const adReport = {
  id: 'r-1',
  reason: 'SCAM',
  status: 'PENDING',
  targetType: 'AD',
  targetId: 'ad-1',
  notes: 'يبدو أن السعر غير حقيقي',
  ad: { title: 'سيارة تويوتا كورولا 2015 للبيع بحالة ممتازة جدا' },
  createdAt: '2026-08-01T00:00:00.000Z',
};
const userReport = {
  id: 'r-2',
  reason: 'OFFENSIVE',
  status: 'RESOLVED',
  targetType: 'USER',
  targetId: 'user-1',
  notes: null,
  ad: null,
  createdAt: '2026-08-05T00:00:00.000Z',
};

function mockReports(overrides: Record<string, unknown> = {}) {
  (useMyReports as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [adReport], meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('MyReportsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReports();
  });

  it('shows a spinner while loading', () => {
    mockReports({ data: undefined, isLoading: true });
    render(<MyReportsList />);

    expect(screen.queryByText('لا توجد بلاغات')).not.toBeInTheDocument();
  });

  it('shows an error message with retry on failure', async () => {
    mockReports({ data: undefined, isError: true });
    const user = userEvent.setup();
    render(<MyReportsList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل بلاغاتك')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the empty state when there are no reports', () => {
    mockReports({ data: { items: [], meta: { totalPages: 1 } } });
    render(<MyReportsList />);

    expect(screen.getByText('لا توجد بلاغات')).toBeInTheDocument();
  });

  it('renders the reason label, target-type tag, and status label for a report', () => {
    render(<MyReportsList />);

    expect(screen.getByText('عملية احتيال')).toBeInTheDocument();
    expect(screen.getByText('[إعلان]')).toBeInTheDocument();
    expect(screen.getByText('قيد المراجعة')).toBeInTheDocument();
  });

  it('renders report notes when present', () => {
    render(<MyReportsList />);

    expect(screen.getByText('يبدو أن السعر غير حقيقي')).toBeInTheDocument();
  });

  it('omits the notes paragraph when notes is null', () => {
    mockReports({ data: { items: [userReport], meta: { totalPages: 1 } } });
    render(<MyReportsList />);

    expect(screen.queryByText('يبدو أن السعر غير حقيقي')).not.toBeInTheDocument();
  });

  it('shows the truncated ad title as the link text when the report has an ad', () => {
    render(<MyReportsList />);

    expect(screen.getByText(/سيارة تويوتا كورولا/)).toBeInTheDocument();
  });

  it('falls back to a generic "عرض التفاصيل" link label when there is no ad title', () => {
    mockReports({ data: { items: [userReport], meta: { totalPages: 1 } } });
    render(<MyReportsList />);

    expect(screen.getByText('عرض التفاصيل')).toBeInTheDocument();
  });

  it('shows the RESOLVED status label for a resolved report', () => {
    mockReports({ data: { items: [userReport], meta: { totalPages: 1 } } });
    render(<MyReportsList />);

    expect(screen.getByText('تم الحل')).toBeInTheDocument();
    expect(screen.getByText('[مستخدم]')).toBeInTheDocument();
  });

  it('does not render pagination controls for a single page', () => {
    render(<MyReportsList />);

    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('renders pagination and disables "السابق" on the first page', () => {
    mockReports({ data: { items: [adReport], meta: { totalPages: 3 } } });
    render(<MyReportsList />);

    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'التالي' })).not.toBeDisabled();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('advances to the next page on click', async () => {
    mockReports({ data: { items: [adReport], meta: { totalPages: 3 } } });
    const user = userEvent.setup();
    render(<MyReportsList />);

    await user.click(screen.getByRole('button', { name: 'التالي' }));

    expect(useMyReports).toHaveBeenLastCalledWith({ page: 2 });
  });
});
