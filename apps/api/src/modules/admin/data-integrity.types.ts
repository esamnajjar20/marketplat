export interface DataIntegritySample {
  id: string;
  [key: string]: unknown;
}

export interface DataIntegrityCheckResult {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  entityType: string;
  count: number;
  samples: DataIntegritySample[];
}

export interface DataIntegrityScanReport {
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
  checks: DataIntegrityCheckResult[];
}

export function isDataIntegrityScanReport(value: unknown): value is DataIntegrityScanReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  const severity = report.bySeverity as Record<string, unknown> | null;
  if (
    report.mode !== 'read_only' ||
    typeof report.scannedAt !== 'string' || !Number.isFinite(Date.parse(report.scannedAt)) ||
    !Number.isSafeInteger(report.durationMillis) || (report.durationMillis as number) < 0 ||
    !Number.isSafeInteger(report.checkCount) || (report.checkCount as number) < 1 ||
    !Number.isSafeInteger(report.findingCount) || (report.findingCount as number) < 0 ||
    !severity || typeof severity !== 'object' ||
    !['critical', 'warning', 'info'].every(key => Number.isSafeInteger(severity[key]) && (severity[key] as number) >= 0) ||
    !Array.isArray(report.checks) || report.checks.length !== report.checkCount
  ) return false;

  const seenCodes = new Set<string>();
  let findingCount = 0;
  const totals = { critical: 0, warning: 0, info: 0 };
  for (const check of report.checks) {
    if (!check || typeof check !== 'object' || Array.isArray(check)) return false;
    const row = check as Record<string, unknown>;
    if (
      typeof row.code !== 'string' || row.code.length === 0 || seenCodes.has(row.code) ||
      (row.severity !== 'critical' && row.severity !== 'warning' && row.severity !== 'info') ||
      typeof row.title !== 'string' || typeof row.description !== 'string' ||
      typeof row.entityType !== 'string' ||
      !Number.isSafeInteger(row.count) || (row.count as number) < 0 ||
      !Array.isArray(row.samples) || row.samples.length > 10 ||
      !row.samples.every(sample => Boolean(sample) && typeof sample === 'object' &&
        !Array.isArray(sample) && typeof (sample as Record<string, unknown>).id === 'string' &&
        ((sample as Record<string, unknown>).id as string).length > 0)
    ) return false;

    seenCodes.add(row.code);
    findingCount += row.count as number;
    if (row.severity === 'critical') totals.critical += row.count as number;
    else if (row.severity === 'warning') totals.warning += row.count as number;
    else totals.info += row.count as number;
  }

  return Number.isSafeInteger(findingCount) &&
    Object.values(totals).every(Number.isSafeInteger) &&
    findingCount === report.findingCount &&
    totals.critical === severity.critical &&
    totals.warning === severity.warning &&
    totals.info === severity.info;
}
