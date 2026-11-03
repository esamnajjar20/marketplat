import { isFraudMonitorScanReport } from '../../src/modules/fraud/fraud-monitor.types';

describe('isFraudMonitorScanReport', () => {
  const validReport = {
    mode: 'read_only',
    scannedAt: '2026-11-02T08:00:00.000Z',
    durationMillis: 125,
    checkCount: 4,
    findingCount: 1,
    bySeverity: { critical: 0, warning: 1, info: 0 },
    checks: [
      { code: 'REPORTER_BURST', severity: 'warning', title: 'a', description: 'b', entityType: 'reporter', count: 1, samples: [{ id: 'user_1', reportCount: 8 }] },
      { code: 'REPORT_TARGET_BURST', severity: 'warning', title: 'a', description: 'b', entityType: 'reported_target', count: 0, samples: [] },
      { code: 'NEW_ACCOUNT_REPORT_BURST', severity: 'warning', title: 'a', description: 'b', entityType: 'reporter', count: 0, samples: [] },
      { code: 'REPEATED_UNREVIEWED_FRAUD_SIGNALS', severity: 'warning', title: 'a', description: 'b', entityType: 'user', count: 0, samples: [] },
    ],
  };

  it('accepts a complete scan with internally consistent totals', () => {
    expect(isFraudMonitorScanReport(validReport)).toBe(true);
  });

  it('rejects a report with inconsistent totals', () => {
    expect(isFraudMonitorScanReport({ ...validReport, findingCount: 2 })).toBe(false);
  });

  it('rejects unknown and duplicate check codes', () => {
    const checks = [...validReport.checks];
    checks[0] = { ...checks[0], code: 'UNKNOWN_RULE' };
    expect(isFraudMonitorScanReport({ ...validReport, checks })).toBe(false);
  });


  it('rejects samples containing fields outside the privacy-safe response contract', () => {
    const checks = [...validReport.checks];
// @ts-expect-error - Testing extra email property constraint
    checks[0] = { ...checks[0], samples: [{ id: 'user_1', reportCount: 8, email: 'private@example.test' }] };
    expect(isFraudMonitorScanReport({ ...validReport, checks })).toBe(false);
  });

  it('rejects unbounded samples and missing sample IDs', () => {
    const checks = [...validReport.checks];
// @ts-expect-error - Testing invalid email property
    checks[0] = { ...checks[0], samples: Array.from({ length: 11 }, (_, index) => ({ id: `u${index}` })) };
    expect(isFraudMonitorScanReport({ ...validReport, checks, findingCount: 1 })).toBe(false);
// @ts-expect-error - Testing invalid email property
    checks[0] = { ...checks[0], samples: [{ email: 'not-allowed' }] };
    expect(isFraudMonitorScanReport({ ...validReport, checks })).toBe(false);
  });
});
