import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FraudMonitorPanel } from '@/components/admin/FraudMonitorPanel';
import { adminApi } from '@/api/admin.api';

vi.mock('@/api/admin.api', () => ({
  adminApi: {
    runFraudMonitorScan: vi.fn(),
    getFraudMonitorHistory: vi.fn(),
  },
}));

const report = {
  mode: 'read_only' as const,
  scannedAt: '2026-11-02T08:00:00.000Z',
  durationMillis: 42,
  checkCount: 4,
  findingCount: 1,
  bySeverity: { critical: 0, warning: 1, info: 0 },
  checks: [
    {
      code: 'REPORTER_BURST', severity: 'warning' as const,
      title: 'حساب يرسل بلاغات كثيرة خلال يوم', description: 'مؤشر يحتاج مراجعة بشرية.',
      entityType: 'reporter', count: 1, samples: [{ id: 'user-1', reportCount: 8, targetCount: 5 }],
    },
    { code: 'REPORT_TARGET_BURST', severity: 'warning' as const, title: 'تجمّع', description: 'لا نتائج', entityType: 'reported_target', count: 0, samples: [] },
    { code: 'NEW_ACCOUNT_REPORT_BURST', severity: 'warning' as const, title: 'حساب حديث', description: 'لا نتائج', entityType: 'reporter', count: 0, samples: [] },
    { code: 'REPEATED_UNREVIEWED_FRAUD_SIGNALS', severity: 'warning' as const, title: 'إشارات متكررة', description: 'لا نتائج', entityType: 'user', count: 0, samples: [] },
  ],
};

const history = {
  retentionDays: 180,
  runs: [],
  changes: [],
};

describe('FraudMonitorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getFraudMonitorHistory).mockResolvedValue(history);
  });

  it('runs a manual read-only scan and renders findings', async () => {
    vi.mocked(adminApi.runFraudMonitorScan).mockResolvedValue(report);
    render(<FraudMonitorPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'بدء الفحص' }));

    await waitFor(() => expect(screen.getByText('اندفاع البلاغات من حساب واحد')).toBeTruthy());
    expect(screen.getByText('إجمالي الحالات').parentElement?.textContent).toContain('1');
    expect(screen.getByText('user-1')).toBeTruthy();
    expect(screen.getByText(/لا يؤدي هذا الفحص إلى حظر مستخدم/)).toBeTruthy();
    expect(adminApi.runFraudMonitorScan).toHaveBeenCalledTimes(1);
  });

  it('does not trigger a scan on mount', () => {
    render(<FraudMonitorPanel />);
    expect(adminApi.runFraudMonitorScan).not.toHaveBeenCalled();
    expect(adminApi.getFraudMonitorHistory).toHaveBeenCalledTimes(1);
  });
});
