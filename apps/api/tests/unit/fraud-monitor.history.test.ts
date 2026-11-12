import { buildFraudMonitorChanges, type FraudMonitorHistoryRun } from '../../src/modules/trust/fraud/fraud-monitor.service';

function run(status: FraudMonitorHistoryRun['status'], checks: FraudMonitorHistoryRun['checks']): FraudMonitorHistoryRun {
  return {
    id: `${status}-${checks.length}`,
    trigger: 'MANUAL',
    status,
    executionPath: 'GO',
    startedAt: '2026-11-02T08:00:00.000Z',
    completedAt: '2026-11-02T08:00:01.000Z',
    durationMillis: 1000,
    findingCount: checks.reduce((total, check) => total + check.count, 0),
    bySeverity: { critical: 0, warning: 0, info: 0 },
    attempts: 1,
    failureCode: null,
    checks,
  };
}

describe('buildFraudMonitorChanges', () => {
  it('compares the two latest successful snapshots and ignores failed runs', () => {
    const changes = buildFraudMonitorChanges([
      run('FAILED', []),
      run('COMPLETED', [
        { code: 'REPORTER_BURST', severity: 'warning', count: 7, sampleCount: 7 },
        { code: 'REPORT_TARGET_BURST', severity: 'warning', count: 2, sampleCount: 2 },
      ]),
      run('COMPLETED', [
        { code: 'REPORTER_BURST', severity: 'warning', count: 4, sampleCount: 4 },
        { code: 'REPORT_TARGET_BURST', severity: 'warning', count: 5, sampleCount: 5 },
      ]),
    ]);

    expect(changes).toEqual([
      { code: 'REPORTER_BURST', latestCount: 7, previousCount: 4, delta: 3 },
      { code: 'REPORT_TARGET_BURST', latestCount: 2, previousCount: 5, delta: -3 },
    ]);
  });

  it('marks the first successful snapshot as having no comparison baseline', () => {
    const changes = buildFraudMonitorChanges([
      run('COMPLETED', [{ code: 'REPORTER_BURST', severity: 'warning', count: 1, sampleCount: 1 }]),
    ]);
    expect(changes).toEqual([
      { code: 'REPORTER_BURST', latestCount: 1, previousCount: null, delta: null },
    ]);
  });
});
