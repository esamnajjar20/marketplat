/**
 * __tests__/components/AdminReportsTable.test.tsx
 *
 * FIX TYPE-ERROR-01 regression coverage: this component previously read
 * report.details and report.reporter, neither of which exist on the
 * Report type (real fields are report.notes and report.user) — both
 * silently rendered nothing at runtime with no compile error under
 * loose typing. This suite specifically pins down that report.notes
 * and report.user.name actually render, so a regression back to the
 * wrong field names would be caught immediately by a failing assertion
 * rather than a silent missing value.
 *
 * Also covers: resolve/dismiss actions fire their mutation immediately
 * with no confirmation dialog (unlike AdminAdsTable's delete flow),
 * action buttons only show for PENDING reports, and the status filter
 * buttons reflect the current filter via aria-pressed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminReportsTable } from '@/components/admin/AdminReportsTable';
import { useAdminReports } from '@/hooks/queries/useAdmin';
import { useAdminUpdateReportStatus } from '@/hooks/mutations/useAdminMutations';
import type { Report } from '@/types/admin.types';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminReports: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminUpdateReportStatus: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

const mockResolveMutate = vi.fn();

const baseReport: Report = {
  id: 'report-1',
  reason: 'SCAM',
  notes: 'هذا الإعلان يبدو مزيفاً، الصور منسوخة من موقع آخر',
  status: 'PENDING',
  adId: 'ad-1',
  userId: 'reporter-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  ad: { id: 'ad-1', title: 'سيارة تويوتا', status: 'ACTIVE' } as never,
  user: { id: 'reporter-1', name: 'خالد', email: 'khaled@example.com' } as never,
};

function mockReportsData(items: Report[]) {
  vi.mocked(useAdminReports).mockReturnValue({
    data: { items, meta: { totalPages: 1 } },
    isLoading: false,
  } as never);
}

describe('AdminReportsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    vi.mocked(useAdminUpdateReportStatus).mockReturnValue({ mutate: mockResolveMutate } as never);
    mockReportsData([baseReport]);
  });

  describe('rendering (TYPE-ERROR-01 regression coverage)', () => {
    it('renders report.notes (not the nonexistent report.details field)', () => {
      render(<AdminReportsTable />);
      expect(
        screen.getByText('هذا الإعلان يبدو مزيفاً، الصور منسوخة من موقع آخر'),
      ).toBeInTheDocument();
    });

    it("renders report.user.name (not the nonexistent report.reporter field)", () => {
      render(<AdminReportsTable />);
      expect(screen.getByText('خالد')).toBeInTheDocument();
    });

    it('does not render a stray "—" placeholder for the reporter when user is present', () => {
      render(<AdminReportsTable />);
      // The old bug always fell back to '—' since report.reporter was
      // always undefined — with the fix, the real name should win.
      expect(screen.queryByText('—')).not.toBeInTheDocument();
    });

    it('falls back to "—" only when user is genuinely absent', () => {
      mockReportsData([{ ...baseReport, user: null as never }]);
      render(<AdminReportsTable />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('does not render a notes paragraph when notes is null', () => {
      mockReportsData([{ ...baseReport, notes: null }]);
      render(<AdminReportsTable />);
      expect(screen.queryByText(/يبدو مزيفاً/)).not.toBeInTheDocument();
    });

    it('shows the Arabic reason label', () => {
      render(<AdminReportsTable />);
      expect(screen.getByText('عملية احتيال')).toBeInTheDocument();
    });

    it('shows an empty-state message when there are no reports', () => {
      mockReportsData([]);
      render(<AdminReportsTable />);
      expect(screen.getByText('لا توجد بلاغات')).toBeInTheDocument();
    });
  });

  describe('resolve/dismiss — fire immediately, no confirmation dialog', () => {
    it('calls useAdminUpdateReportStatus.mutate with RESOLVED on "حل" click, with no dialog', async () => {
      const user = userEvent.setup();
      render(<AdminReportsTable />);

      const table = screen.getByRole('table');
      await user.click(within(table).getByRole('button', { name: /حل/ }));

      expect(mockResolveMutate).toHaveBeenCalledWith({ reportId: 'report-1', status: 'RESOLVED' });
      expect(screen.queryByText(/متأكد/)).not.toBeInTheDocument();
    });

    it('calls useAdminUpdateReportStatus.mutate with DISMISSED on "رفض" click', async () => {
      const user = userEvent.setup();
      render(<AdminReportsTable />);

      await user.click(screen.getByRole('button', { name: 'رفض' }));

      expect(mockResolveMutate).toHaveBeenCalledWith({ reportId: 'report-1', status: 'DISMISSED' });
    });

    it('does not render resolve/dismiss actions for an already-resolved report', () => {
      mockReportsData([{ ...baseReport, status: 'RESOLVED' }]);
      render(<AdminReportsTable />);

      const table = screen.getByRole('table');
      expect(within(table).queryByRole('button', { name: /حل/ })).not.toBeInTheDocument();
      expect(within(table).queryByRole('button', { name: 'رفض' })).not.toBeInTheDocument();
    });
  });

  describe('status filter', () => {
    it('defaults to the PENDING filter and marks it aria-pressed', () => {
      render(<AdminReportsTable />);
      expect(screen.getByRole('button', { name: 'قيد المراجعة' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('pushes a URL with the selected status, clearing any page param', async () => {
      mockSearchParams = new URLSearchParams('page=4');
      const user = userEvent.setup();
      render(<AdminReportsTable />);

      await user.click(screen.getByRole('button', { name: 'محلولة' }));

      const calledUrl = mockPush.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/status=RESOLVED/);
      expect(calledUrl).not.toMatch(/page=/);
    });
  });
});
