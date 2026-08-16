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
 * Also covers: resolve/dismiss actions go through a ConfirmDialog
 * (UX-FIX audit P2-05 — a misclick while triaging a report queue
 * previously had no visible recovery), action buttons only show for
 * PENDING reports, and the status filter buttons reflect the current
 * filter via aria-pressed.
 *
 * STALE-TEST-FIX (found while implementing item 17 / BULK-ADMIN): this
 * suite previously asserted resolve/dismiss fire their mutation
 * immediately with *no* confirmation dialog. That was true before
 * UX-FIX P2-05 added ConfirmDialog to this exact flow (see the
 * component's own comment above confirmTarget) — the test was never
 * updated after that change landed, so it was asserting behavior the
 * component no longer has. Fixed here to match current behavior:
 * click "حل"/"رفض" opens ConfirmDialog, and the mutation only fires on
 * confirming it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminReportsTable } from '@/components/admin/AdminReportsTable';
import { useAdminReports } from '@/hooks/queries/useAdmin';
import { useAdminUpdateReportStatus, useAdminBulkUpdateReportStatus } from '@/hooks/mutations/useAdminMutations';
import type { Report } from '@/types/admin.types';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminReports: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminUpdateReportStatus: vi.fn(),
  useAdminBulkUpdateReportStatus: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

const mockResolveMutate = vi.fn();
const mockBulkResolveMutate = vi.fn();

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

const secondReport: Report = {
  ...baseReport,
  id: 'report-2',
  notes: null,
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
    vi.mocked(useAdminBulkUpdateReportStatus).mockReturnValue({
      mutate: mockBulkResolveMutate,
      isPending: false,
    } as never);
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

  describe('resolve/dismiss — go through ConfirmDialog (UX-FIX P2-05)', () => {
    it('opens a confirm dialog on "حل" click without firing the mutation yet', async () => {
      const user = setupUser();
      render(<AdminReportsTable />);

      const table = screen.getByRole('table');
      await user.click(within(table).getByRole('button', { name: /حل/ }));

      expect(mockResolveMutate).not.toHaveBeenCalled();
      expect(screen.getByText('حل هذا البلاغ؟')).toBeInTheDocument();
    });

    it('calls useAdminUpdateReportStatus.mutate with RESOLVED after confirming', async () => {
      const user = setupUser();
      render(<AdminReportsTable />);

      const table = screen.getByRole('table');
      await user.click(within(table).getByRole('button', { name: /حل/ }));
      await user.click(screen.getByRole('button', { name: 'حل البلاغ' }));

      expect(mockResolveMutate).toHaveBeenCalledWith(
        { reportId: 'report-1', status: 'RESOLVED' },
        expect.anything(),
      );
    });

    it('calls useAdminUpdateReportStatus.mutate with DISMISSED after confirming "رفض"', async () => {
      const user = setupUser();
      render(<AdminReportsTable />);

      await user.click(screen.getByRole('button', { name: 'رفض' }));
      await user.click(screen.getByRole('button', { name: 'رفض البلاغ' }));

      expect(mockResolveMutate).toHaveBeenCalledWith(
        { reportId: 'report-1', status: 'DISMISSED' },
        expect.anything(),
      );
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
      const user = setupUser();
      render(<AdminReportsTable />);

      await user.click(screen.getByRole('button', { name: 'محلولة' }));

      const calledUrl = mockPush.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/status=RESOLVED/);
      expect(calledUrl).not.toMatch(/page=/);
    });
  });

  describe('bulk actions (item 17)', () => {
    it('shows no bulk action bar when nothing is selected', () => {
      mockReportsData([baseReport, secondReport]);
      render(<AdminReportsTable />);
      expect(screen.queryByRole('toolbar', { name: 'إجراءات جماعية' })).not.toBeInTheDocument();
    });

    it('shows the selected count after checking a row', async () => {
      mockReportsData([baseReport, secondReport]);
      const user = setupUser();
      render(<AdminReportsTable />);

      await user.click(screen.getByRole('checkbox', { name: `تحديد البلاغ ${baseReport.id}` }));

      expect(screen.getByText('1 محدد')).toBeInTheDocument();
    });

    it('select-all checks every PENDING row and updates the count', async () => {
      mockReportsData([baseReport, secondReport]);
      const user = setupUser();
      render(<AdminReportsTable />);

      await user.click(screen.getByRole('checkbox', { name: 'تحديد كل البلاغات' }));

      expect(screen.getByText('2 محدد')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: `تحديد البلاغ ${baseReport.id}` })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: `تحديد البلاغ ${secondReport.id}` })).toBeChecked();
    });

    it('does not render a checkbox for a non-PENDING report', () => {
      mockReportsData([{ ...baseReport, status: 'RESOLVED' }]);
      render(<AdminReportsTable />);
      expect(
        screen.queryByRole('checkbox', { name: `تحديد البلاغ ${baseReport.id}` }),
      ).not.toBeInTheDocument();
    });

    it('opens a bulk confirm dialog and calls the bulk mutation with the selected ids on confirm', async () => {
      mockReportsData([baseReport, secondReport]);
      const user = setupUser();
      render(<AdminReportsTable />);

      await user.click(screen.getByRole('checkbox', { name: `تحديد البلاغ ${baseReport.id}` }));
      await user.click(screen.getByRole('checkbox', { name: `تحديد البلاغ ${secondReport.id}` }));
      await user.click(screen.getByRole('button', { name: 'حل المحدد' }));

      expect(screen.getByText('حل 2 بلاغ؟')).toBeInTheDocument();
      expect(mockBulkResolveMutate).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'حل البلاغات' }));

      expect(mockBulkResolveMutate).toHaveBeenCalledWith(
        { reportIds: [baseReport.id, secondReport.id], status: 'RESOLVED' },
        expect.anything(),
      );
    });

    it('opens a dismiss confirm dialog for the "رفض المحدد" bulk action', async () => {
      mockReportsData([baseReport, secondReport]);
      const user = setupUser();
      render(<AdminReportsTable />);

      await user.click(screen.getByRole('checkbox', { name: `تحديد البلاغ ${baseReport.id}` }));
      await user.click(screen.getByRole('button', { name: 'رفض المحدد' }));

      expect(screen.getByText('رفض 1 بلاغ؟')).toBeInTheDocument();
    });

    it('clears the selection when "إلغاء التحديد" is clicked', async () => {
      mockReportsData([baseReport, secondReport]);
      const user = setupUser();
      render(<AdminReportsTable />);

      await user.click(screen.getByRole('checkbox', { name: `تحديد البلاغ ${baseReport.id}` }));
      expect(screen.getByText('1 محدد')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /إلغاء التحديد/ }));

      expect(screen.queryByRole('toolbar', { name: 'إجراءات جماعية' })).not.toBeInTheDocument();
    });

    it('does not render the bulk action bar on a non-PENDING status view', () => {
      mockSearchParams = new URLSearchParams('status=RESOLVED');
      mockReportsData([{ ...baseReport, status: 'RESOLVED' }]);
      render(<AdminReportsTable />);

      expect(screen.queryByRole('checkbox', { name: 'تحديد كل البلاغات' })).not.toBeInTheDocument();
    });

    it('clears the selection when the page param changes', async () => {
      mockReportsData([baseReport, secondReport]);
      const user = setupUser();
      const { rerender } = render(<AdminReportsTable />);

      await user.click(screen.getByRole('checkbox', { name: `تحديد البلاغ ${baseReport.id}` }));
      expect(screen.getByText('1 محدد')).toBeInTheDocument();

      mockSearchParams = new URLSearchParams('page=2');
      rerender(<AdminReportsTable />);

      expect(screen.queryByRole('toolbar', { name: 'إجراءات جماعية' })).not.toBeInTheDocument();
    });
  });
});
