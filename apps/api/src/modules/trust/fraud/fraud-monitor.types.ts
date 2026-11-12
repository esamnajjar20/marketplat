export interface FraudMonitorSample {
  id: string;
  [key: string]: unknown;
}

export interface FraudMonitorCheckResult {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  entityType: string;
  count: number;
  samples: FraudMonitorSample[];
}

export interface FraudMonitorScanReport {
  mode: 'read_only';
  scannedAt: string;
  durationMillis: number;
  checkCount: number;
  findingCount: number;
  bySeverity: {
    critical: number;
    warning: number;
    info: number;
  };
  checks: FraudMonitorCheckResult[];
}

const SAMPLE_KEYS: Record<string, readonly string[]> = {
  REPORTER_BURST: ['id', 'reportCount', 'targetCount'],
  REPORT_TARGET_BURST: ['id', 'targetType', 'reporterCount', 'firstReportAt', 'lastReportAt'],
  NEW_ACCOUNT_REPORT_BURST: ['id', 'reportCount', 'targetCount', 'accountCreatedAt'],
  REPEATED_UNREVIEWED_FRAUD_SIGNALS: ['id', 'signalCount', 'adCount', 'firstSignalAt', 'lastSignalAt'],
};

const COUNT_FIELDS = ['reportCount', 'targetCount', 'reporterCount', 'signalCount', 'adCount'] as const;
const REPORT_TARGET_TYPES = new Set(['AD', 'USER', 'STORE', 'PRODUCT', 'SERVICE_LISTING']);

function isSafeFraudMonitorSample(code: string, value: unknown): value is FraudMonitorSample {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const sample = value as Record<string, unknown>;
  const allowedKeys = SAMPLE_KEYS[code];
  const sampleKeys = Object.keys(sample);
  if (!allowedKeys || sampleKeys.length !== allowedKeys.length || sampleKeys.some(key => !allowedKeys.includes(key))) return false;
  if (typeof sample.id !== 'string' || sample.id.length === 0 || sample.id.length > 128) return false;

  for (const key of COUNT_FIELDS) {
    if (key in sample && (!Number.isSafeInteger(sample[key]) || (sample[key] as number) < 0)) return false;
  }
  for (const key of ['firstReportAt', 'lastReportAt', 'accountCreatedAt', 'firstSignalAt', 'lastSignalAt']) {
    if (key in sample && (typeof sample[key] !== 'string' || !Number.isFinite(Date.parse(sample[key] as string)))) return false;
  }
  if ('targetType' in sample && (typeof sample.targetType !== 'string' || !REPORT_TARGET_TYPES.has(sample.targetType))) return false;
  return true;
}

export function isFraudMonitorScanReport(value: unknown): value is FraudMonitorScanReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  const severity = report.bySeverity as Record<string, unknown> | null;
  if (
    report.mode !== 'read_only' ||
    typeof report.scannedAt !== 'string' || !Number.isFinite(Date.parse(report.scannedAt)) ||
    !Number.isSafeInteger(report.durationMillis) || (report.durationMillis as number) < 0 ||
    !Number.isSafeInteger(report.checkCount) || report.checkCount !== 4 ||
    !Number.isSafeInteger(report.findingCount) || (report.findingCount as number) < 0 ||
    !severity || typeof severity !== 'object' || Array.isArray(severity) ||
    !['critical', 'warning', 'info'].every(key => Number.isSafeInteger(severity[key]) && (severity[key] as number) >= 0) ||
    !Array.isArray(report.checks) || report.checks.length !== report.checkCount
  ) return false;

  const expectedCodes = new Set([
    'REPORTER_BURST',
    'REPORT_TARGET_BURST',
    'NEW_ACCOUNT_REPORT_BURST',
    'REPEATED_UNREVIEWED_FRAUD_SIGNALS',
  ]);
  const seenCodes = new Set<string>();
  const totals = { critical: 0, warning: 0, info: 0 };
  let findingCount = 0;
  for (const check of report.checks) {
    if (!check || typeof check !== 'object' || Array.isArray(check)) return false;
    const row = check as Record<string, unknown>;
    if (
      typeof row.code !== 'string' || !expectedCodes.has(row.code) || seenCodes.has(row.code) ||
      (row.severity !== 'critical' && row.severity !== 'warning' && row.severity !== 'info') ||
      typeof row.title !== 'string' || row.title.length === 0 ||
      typeof row.description !== 'string' || row.description.length === 0 ||
      typeof row.entityType !== 'string' || row.entityType !== ({
        REPORTER_BURST: 'reporter',
        REPORT_TARGET_BURST: 'reported_target',
        NEW_ACCOUNT_REPORT_BURST: 'reporter',
        REPEATED_UNREVIEWED_FRAUD_SIGNALS: 'user',
      } as Record<string, string>)[row.code] || row.severity !== 'warning' ||
      !Number.isSafeInteger(row.count) || (row.count as number) < 0 ||
      !Array.isArray(row.samples) || row.samples.length > 10 || row.samples.length > (row.count as number) ||
      !row.samples.every(sample => isSafeFraudMonitorSample(row.code as string, sample))
    ) return false;

    seenCodes.add(row.code);
    findingCount += row.count as number;
    // Every fraud monitor check is 'warning'; the validation above enforces this.
    totals.warning += row.count as number;
  }

  return seenCodes.size === expectedCodes.size &&
    Number.isSafeInteger(findingCount) &&
    Object.values(totals).every(Number.isSafeInteger) &&
    findingCount === report.findingCount &&
    totals.critical === severity.critical &&
    totals.warning === severity.warning &&
    totals.info === severity.info;
}
