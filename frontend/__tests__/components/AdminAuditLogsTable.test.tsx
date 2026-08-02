/**
 * __tests__/components/AdminAuditLogsTable.test.tsx
 *
 * Covers: rendering event/user/date/IP/user-agent columns, the empty
 * state, the details dialog opening with the raw `details` JSON, and
 * that filter inputs push the right query params (clearing `page`) —
 * mirroring AdminReportsTable.test.tsx / AdminUsersTable's search
 * pattern for this codebase's URL-state-driven admin tables.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAuditLogsTable } from '@/components/admin/AdminAuditLogsTable';
import { useAdminAuditLogs } from '@/hooks/queries/useAdmin';
import type { AuditLog } from '@/types/admin.types';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminAuditLogs: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

const baseLog: AuditLog = {
  id: 'log-1',
  event: 'ADMIN_USER_STATUS_CHANGED',
  userId: 'admin-1',
  sessionId: null,
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0 Test Agent',
  details: { targetUserId: 'user-1', isActive: false },
  createdAt: '2026-01-01T00:00:00.000Z',
  user: { id: 'admin-1', name: 'أحمد', email: 'admin@example.com' },
};

function mockAuditLogsData(items: AuditLog[]) {
  vi.mocked(useAdminAuditLogs).mockReturnValue({
    data: { items, meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
}

describe('AdminAuditLogsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockAuditLogsData([baseLog]);
  });

  describe('rendering', () => {
    it('renders the Arabic label for the event', () => {
      render(<AdminAuditLogsTable />);
      expect(screen.getByText('تغيير حالة مستخدم (إدارة)')).toBeInTheDocument();
    });

    it('renders the related user name', () => {
      render(<AdminAuditLogsTable />);
      expect(screen.getByText('أحمد')).toBeInTheDocument();
    });

    it('renders the IP address', () => {
      render(<AdminAuditLogsTable />);
      expect(screen.getByText('127.0.0.1')).toBeInTheDocument();
    });

    it('renders the user agent', () => {
      render(<AdminAuditLogsTable />);
      expect(screen.getByText('Mozilla/5.0 Test Agent')).toBeInTheDocument();
    });

    it('falls back to the raw userId when no related user is present', () => {
      mockAuditLogsData([{ ...baseLog, user: null }]);
      render(<AdminAuditLogsTable />);
      expect(screen.getByText('admin-1')).toBeInTheDocument();
    });

    it('shows an empty-state message when there are no logs', () => {
      mockAuditLogsData([]);
      render(<AdminAuditLogsTable />);
      expect(screen.getByText('لا توجد سجلات')).toBeInTheDocument();
    });

    it('falls back to the raw event name for an unmapped event', () => {
      mockAuditLogsData([{ ...baseLog, event: 'SOME_FUTURE_EVENT' as never }]);
      render(<AdminAuditLogsTable />);
      expect(screen.getByText('SOME_FUTURE_EVENT')).toBeInTheDocument();
    });
  });

  describe('details dialog', () => {
    it('opens and shows the formatted JSON details on clicking the details button', async () => {
      const user = userEvent.setup();
      render(<AdminAuditLogsTable />);

      const table = screen.getByRole('table');
      await user.click(within(table).getByRole('button', { name: /تفاصيل/ }));

      expect(screen.getByText(/targetUserId/)).toBeInTheDocument();
      expect(screen.getByText(/user-1/)).toBeInTheDocument();
    });

    it('shows a placeholder when details is null', async () => {
      mockAuditLogsData([{ ...baseLog, details: null }]);
      const user = userEvent.setup();
      render(<AdminAuditLogsTable />);

      const table = screen.getByRole('table');
      await user.click(within(table).getByRole('button', { name: /تفاصيل/ }));

      const detailsSection = screen.getByText('التفاصيل:').parentElement;
      expect(within(detailsSection as HTMLElement).getByText('—')).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    it('pushes userId filter and clears the page param', async () => {
      mockSearchParams = new URLSearchParams('page=3');
      const user = userEvent.setup();
      render(<AdminAuditLogsTable />);

      const input = screen.getByPlaceholderText('بحث بمعرّف المستخدم…');
      await user.type(input, 'user-42');
      await user.tab();

      const calledUrl = mockPush.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/userId=user-42/);
      expect(calledUrl).not.toMatch(/page=/);
    });

    it('pushes the selected event type filter', async () => {
      const user = userEvent.setup();
      render(<AdminAuditLogsTable />);

      await user.selectOptions(screen.getByDisplayValue('كل الأحداث'), 'LOGIN_FAILED');

      const calledUrl = mockPush.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/event=LOGIN_FAILED/);
    });
  });
});
