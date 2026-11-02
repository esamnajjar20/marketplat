import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { ConflictError } from '../../shared/errors/ConflictError';
import { requestJsonWithGoFallback } from '../../shared/go-worker/requestJsonWithFallback';
import {
  FraudMonitorCheckResult,
  FraudMonitorSample,
  FraudMonitorScanReport,
  isFraudMonitorScanReport,
} from './fraud-monitor.types';

const SAMPLE_LIMIT = 10;
// Must match fraudmonitor.AdvisoryLockID in the Go worker.
const FRAUD_MONITOR_ADVISORY_LOCK_ID = 731904303n;

// Keep these SQL definitions aligned with apps/go-worker/internal/fraudmonitor.
// They are fixed application constants and are the only SQL interpolated via
// Prisma.raw below. No caller-controlled SQL or filter values are accepted.
const CHECKS = [
  {
    code: 'REPORTER_BURST', severity: 'warning',
    title: 'حساب يرسل بلاغات كثيرة خلال يوم',
    description: 'حساب أرسل 8 بلاغات معلّقة على 5 أهداف مختلفة على الأقل خلال آخر 24 ساعة. قد يكون نمط إساءة استخدام أو نشاط مراجعة مشروع؛ يلزم فحص بشري.',
    entityType: 'reporter',
    query: `SELECT r."userId" AS "id", COUNT(*)::bigint AS "reportCount",
      COUNT(DISTINCT (r."targetType", r."targetId"))::bigint AS "targetCount"
      FROM "reports" r
      WHERE r."status" = 'PENDING' AND r."createdAt" >= NOW() - INTERVAL '24 hours'
      GROUP BY r."userId"
      HAVING COUNT(*) >= 8 AND COUNT(DISTINCT (r."targetType", r."targetId")) >= 5`,
  },
  {
    code: 'REPORT_TARGET_BURST', severity: 'warning',
    title: 'تجمّع بلاغات سريع حول هدف واحد',
    description: 'خمسة مُبلّغين مختلفين على الأقل أرسلوا بلاغات معلّقة حول الهدف نفسه خلال فترة لا تتجاوز ساعتين من آخر 6 ساعات. هذا مؤشر مراجعة وليس دليلًا على التنسيق.',
    entityType: 'reported_target',
    query: `WITH pending_reports AS MATERIALIZED (
        SELECT r."targetType", r."targetId", r."userId", r."createdAt"
        FROM "reports" r
        WHERE r."status" = 'PENDING' AND r."createdAt" >= NOW() - INTERVAL '6 hours'
      ), candidate_windows AS (
        SELECT anchor."targetType", anchor."targetId",
          COUNT(DISTINCT window_report."userId")::bigint AS "reporterCount",
          MIN(window_report."createdAt") AS "firstReportAt",
          MAX(window_report."createdAt") AS "lastReportAt"
        FROM pending_reports anchor
        INNER JOIN pending_reports window_report
          ON window_report."targetType" = anchor."targetType"
          AND window_report."targetId" = anchor."targetId"
          AND window_report."createdAt" >= anchor."createdAt"
          AND window_report."createdAt" <= anchor."createdAt" + INTERVAL '2 hours'
        GROUP BY anchor."targetType", anchor."targetId", anchor."createdAt"
        HAVING COUNT(DISTINCT window_report."userId") >= 5
      ), ranked_windows AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY "targetType", "targetId"
          ORDER BY "reporterCount" DESC, "firstReportAt" ASC, "lastReportAt" ASC
        ) AS "windowRank"
        FROM candidate_windows
      )
      SELECT "targetId" AS "id", "targetType"::text AS "targetType",
        "reporterCount", "firstReportAt", "lastReportAt"
      FROM ranked_windows WHERE "windowRank" = 1`,
  },
  {
    code: 'NEW_ACCOUNT_REPORT_BURST', severity: 'warning',
    title: 'حساب حديث يرسل عدة بلاغات',
    description: 'حساب أُنشئ خلال آخر 48 ساعة وأرسل 3 بلاغات معلّقة على أهداف مختلفة على الأقل خلال آخر 24 ساعة. حداثة الحساب وحدها لا تُعد مخالفة.',
    entityType: 'reporter',
    query: `SELECT r."userId" AS "id", COUNT(*)::bigint AS "reportCount",
      COUNT(DISTINCT (r."targetType", r."targetId"))::bigint AS "targetCount",
      MIN(u."createdAt") AS "accountCreatedAt"
      FROM "reports" r INNER JOIN "users" u ON u."id" = r."userId"
      WHERE r."status" = 'PENDING'
        AND r."createdAt" >= NOW() - INTERVAL '24 hours'
        AND u."createdAt" >= NOW() - INTERVAL '48 hours'
      GROUP BY r."userId"
      HAVING COUNT(*) >= 3 AND COUNT(DISTINCT (r."targetType", r."targetId")) >= 3`,
  },
  {
    code: 'REPEATED_UNREVIEWED_FRAUD_SIGNALS', severity: 'warning',
    title: 'تكرار إشارات احتيال غير مراجعة لحساب',
    description: 'ست إشارات احتيال غير مراجعة أو أكثر مرتبطة بالحساب خلال آخر 24 ساعة. قد تنتج عدة إشارات من إعلان واحد؛ راجع التفاصيل قبل اتخاذ أي إجراء.',
    entityType: 'user',
    query: `SELECT fs."userId" AS "id", COUNT(*)::bigint AS "signalCount",
      COUNT(DISTINCT fs."adId")::bigint AS "adCount",
      MIN(fs."createdAt") AS "firstSignalAt", MAX(fs."createdAt") AS "lastSignalAt"
      FROM "fraud_signals" fs
      WHERE fs."userId" IS NOT NULL AND fs."reviewed" = FALSE
        AND fs."createdAt" >= NOW() - INTERVAL '24 hours'
      GROUP BY fs."userId"
      HAVING COUNT(*) >= 6`,
  },
] as const;

type AggregateRow = { count: bigint; samples: Prisma.JsonValue };

async function runExpressFraudMonitorScan(): Promise<FraudMonitorScanReport> {
  const startedAt = Date.now();
  const scannedAt = new Date(startedAt).toISOString();
  const checks: FraudMonitorCheckResult[] = [];

  await prisma.$transaction(async tx => {
    // Mark the transaction read-only before its first query, then take the
    // same transaction-scoped lock as Go. This prevents fallback from
    // duplicating a Go scan after a network timeout or an already-running 409.
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      SELECT pg_try_advisory_xact_lock(${FRAUD_MONITOR_ADVISORY_LOCK_ID}) AS locked
    `);
    if (lockRows[0]?.locked !== true) {
      throw new ConflictError('Fraud monitor scan is already running', 'FRAUD_MONITOR_ALREADY_RUNNING');
    }
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '12s'");

    for (const definition of CHECKS) {
      const rows = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        WITH findings AS MATERIALIZED (${Prisma.raw(definition.query)})
        SELECT COUNT(*)::bigint AS "count",
          COALESCE((
            SELECT jsonb_agg(to_jsonb(sample_row))
            FROM (SELECT * FROM findings ORDER BY "id" ASC LIMIT ${SAMPLE_LIMIT}) AS sample_row
          ), '[]'::jsonb) AS "samples"
        FROM findings
      `);
      const row = rows[0];
      const count = Number(row?.count ?? 0n);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(`fraud monitor returned an unsafe count for ${definition.code}`);
      }
      const rawSamples = Array.isArray(row?.samples) ? row.samples : [];
      const samples: FraudMonitorSample[] = [];
      for (const sample of rawSamples.slice(0, SAMPLE_LIMIT)) {
        if (!sample || typeof sample !== 'object' || Array.isArray(sample)) continue;
        const sampleRow = sample as Record<string, unknown>;
        if (typeof sampleRow.id === 'string' && sampleRow.id.length > 0) {
          samples.push(sampleRow as FraudMonitorSample);
        }
      }

      checks.push({
        code: definition.code,
        severity: definition.severity,
        title: definition.title,
        description: definition.description,
        entityType: definition.entityType,
        count,
        samples,
      });
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    maxWait: 5_000,
    timeout: 20_000,
  });

  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const check of checks) bySeverity[check.severity] += check.count;
  return {
    mode: 'read_only',
    scannedAt,
    durationMillis: Math.max(0, Date.now() - startedAt),
    checkCount: checks.length,
    findingCount: checks.reduce((sum, check) => sum + check.count, 0),
    bySeverity,
    checks,
  };
}

let inFlightScan: Promise<FraudMonitorScanReport> | null = null;

const HISTORY_RETENTION_DAYS = 180;
const HISTORY_LIMIT = 14;
const RUNNING_STALE_MINUTES = 45;

type ScanTrigger = 'MANUAL' | 'SCHEDULED';
type ExecutionPath = 'GO' | 'EXPRESS';

type ClaimedRun = { id: string; alreadyCompleted: false } | { id: null; alreadyCompleted: true };

export interface FraudMonitorHistoryRun {
  id: string;
  trigger: 'MANUAL' | 'SCHEDULED';
  status: 'COMPLETED' | 'FAILED' | 'RUNNING';
  executionPath: 'GO' | 'EXPRESS' | null;
  startedAt: string;
  completedAt: string | null;
  durationMillis: number | null;
  findingCount: number;
  bySeverity: { critical: number; warning: number; info: number };
  attempts: number;
  failureCode: string | null;
  checks: Array<{ code: string; severity: 'critical' | 'warning' | 'info'; count: number; sampleCount: number }>;
}

export interface FraudMonitorHistoryResponse {
  retentionDays: number;
  runs: FraudMonitorHistoryRun[];
  changes: Array<{
    code: string;
    latestCount: number;
    previousCount: number | null;
    delta: number | null;
  }>;
}

export function buildFraudMonitorChanges(runs: FraudMonitorHistoryRun[]): FraudMonitorHistoryResponse['changes'] {
  const successful = runs.filter(run => run.status === 'COMPLETED');
  const latestChecks = new Map(successful[0]?.checks.map(check => [check.code, check.count]) ?? []);
  const previousChecks = new Map(successful[1]?.checks.map(check => [check.code, check.count]) ?? []);
  const codes = new Set([...latestChecks.keys(), ...previousChecks.keys()]);
  return [...codes].sort().map(code => {
    const latestCount = latestChecks.get(code) ?? 0;
    const previousCount = previousChecks.get(code) ?? null;
    return { code, latestCount, previousCount, delta: previousCount === null ? null : latestCount - previousCount };
  });
}

function toSafeCount(value: bigint | number | string): number {
  const count = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Fraud monitor history contains an unsafe aggregate count');
  }
  return count;
}

async function claimScanRun(trigger: ScanTrigger, scheduledFor?: string): Promise<ClaimedRun> {
  if (trigger === 'MANUAL') {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "fraud_monitor_scan_runs" ("trigger", "status", "startedAt", "attempts")
      VALUES ('MANUAL', 'RUNNING', NOW(), 1)
      RETURNING "id"::text AS "id"
    `);
    if (!rows[0]?.id) throw new Error('Could not create fraud monitor history run');
    return { id: rows[0].id, alreadyCompleted: false };
  }

  if (!scheduledFor || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor) ||
      Number.isNaN(Date.parse(`${scheduledFor}T00:00:00.000Z`)) ||
      new Date(`${scheduledFor}T00:00:00.000Z`).toISOString().slice(0, 10) !== scheduledFor) {
    throw new Error('A valid Asia/Gaza scheduled date is required for fraud monitoring');
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "fraud_monitor_scan_runs"
      ("trigger", "scheduledFor", "status", "startedAt", "attempts")
    VALUES ('SCHEDULED', ${scheduledFor}::date, 'RUNNING', NOW(), 1)
    ON CONFLICT ("scheduledFor") DO UPDATE
      SET "status" = 'RUNNING',
          "startedAt" = NOW(),
          "completedAt" = NULL,
          "durationMillis" = NULL,
          "executionPath" = NULL,
          "failureCode" = NULL,
          "attempts" = "fraud_monitor_scan_runs"."attempts" + 1
      WHERE "fraud_monitor_scan_runs"."status" = 'FAILED'
         OR ("fraud_monitor_scan_runs"."status" = 'RUNNING'
             AND "fraud_monitor_scan_runs"."startedAt" < NOW() - (${RUNNING_STALE_MINUTES} * INTERVAL '1 minute'))
    RETURNING "id"::text AS "id"
  `);
  if (rows[0]?.id) return { id: rows[0].id, alreadyCompleted: false };

  const existing = await prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
    SELECT "status" FROM "fraud_monitor_scan_runs" WHERE "scheduledFor" = ${scheduledFor}::date LIMIT 1
  `);
  if (existing[0]?.status === 'COMPLETED') return { id: null, alreadyCompleted: true };
  if (existing[0]?.status === 'RUNNING') {
    throw new ConflictError('Fraud monitor scheduled scan is already running', 'FRAUD_MONITOR_ALREADY_RUNNING');
  }
  throw new Error('Could not claim scheduled fraud monitor history run');
}

async function markScanRunFailed(
  id: string,
  startedAt: number,
  failureCode: 'SCAN_FAILED' | 'HISTORY_WRITE_FAILED',
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "fraud_monitor_scan_runs"
    SET "status" = 'FAILED', "completedAt" = NOW(),
        "durationMillis" = ${Math.max(0, Date.now() - startedAt)},
        "failureCode" = ${failureCode}
    WHERE "id" = ${id}::uuid AND "status" = 'RUNNING'
  `);
}

async function persistSuccessfulScan(
  id: string,
  report: FraudMonitorScanReport,
  executionPath: ExecutionPath,
): Promise<void> {
  const counts = report.bySeverity;
  await prisma.$transaction(async tx => {
    for (const check of report.checks) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "fraud_monitor_check_snapshots"
          ("scanRunId", "checkCode", "severity", "findingCount", "sampleCount")
        VALUES (${id}::uuid, ${check.code}, ${check.severity}, ${BigInt(check.count)}, ${check.samples.length})
      `);
    }

    const updated = await tx.$executeRaw(Prisma.sql`
      UPDATE "fraud_monitor_scan_runs"
      SET "status" = 'COMPLETED', "executionPath" = ${executionPath},
          "completedAt" = NOW(), "durationMillis" = ${report.durationMillis},
          "checkCount" = ${report.checkCount}, "findingCount" = ${BigInt(report.findingCount)},
          "criticalCount" = ${BigInt(counts.critical)}, "warningCount" = ${BigInt(counts.warning)},
          "infoCount" = ${BigInt(counts.info)}, "failureCode" = NULL
      WHERE "id" = ${id}::uuid AND "status" = 'RUNNING'
    `);
    if (updated !== 1) throw new Error('Fraud monitor history run lost its RUNNING claim');
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 5_000,
    timeout: 10_000,
  });
}

async function executeAndRecordScan(trigger: ScanTrigger, scheduledFor?: string): Promise<FraudMonitorScanReport | null> {
  const run = await claimScanRun(trigger, scheduledFor);
  if (run.alreadyCompleted) {
    logger.info('[fraud-monitor] scheduled scan already has a completed history record; skipping duplicate', { scheduledFor });
    return null;
  }

  const startedAt = Date.now();
  let executionPath: ExecutionPath = 'EXPRESS';
  let scanCompleted = false;
  try {
    const report = await requestJsonWithGoFallback<FraudMonitorScanReport>({
      jobName: 'fraud-monitor-scan',
      path: '/internal/fraud/monitor/scan',
      body: {},
      validateResult: isFraudMonitorScanReport,
      timeoutMs: 25_000,
      runExpressFallback: runExpressFraudMonitorScan,
      onGoSuccess: () => { executionPath = 'GO'; },
      onExpressFallbackSuccess: () => { executionPath = 'EXPRESS'; },
    });
    scanCompleted = true;
    await persistSuccessfulScan(run.id, report, executionPath);
    return report;
  } catch (error) {
    try {
      await markScanRunFailed(run.id, startedAt, scanCompleted ? 'HISTORY_WRITE_FAILED' : 'SCAN_FAILED');
    } catch (historyError) {
      logger.error('[fraud-monitor] could not persist failed scan state', {
        errorType: historyError instanceof Error ? historyError.name : 'unknown',
      });
    }
    logger.error('[fraud-monitor] scan failed', {
      trigger,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

export const fraudMonitorService = {
  scan: async (): Promise<FraudMonitorScanReport> => {
    if (inFlightScan) return inFlightScan;
    const scan = executeAndRecordScan('MANUAL').then(report => {
      if (!report) throw new Error('Manual fraud monitor scan was unexpectedly skipped');
      return report;
    });
    inFlightScan = scan;
    try {
      return await scan;
    } finally {
      if (inFlightScan === scan) inFlightScan = null;
    }
  },

  runScheduledScan: async (scheduledFor: string): Promise<boolean> => {
    const report = await executeAndRecordScan('SCHEDULED', scheduledFor);
    return report !== null;
  },

  getHistory: async (): Promise<FraudMonitorHistoryResponse> => {
    const rows = await prisma.$queryRaw<Array<{
      id: string; trigger: string; status: string; executionPath: string | null;
      startedAt: Date; completedAt: Date | null; durationMillis: number | null;
      findingCount: bigint | number | string; criticalCount: bigint | number | string;
      warningCount: bigint | number | string; infoCount: bigint | number | string;
      attempts: number; failureCode: string | null;
    }>>(Prisma.sql`
      SELECT "id"::text AS "id", "trigger", "status", "executionPath",
        "startedAt", "completedAt", "durationMillis", "findingCount",
        "criticalCount", "warningCount", "infoCount", "attempts", "failureCode"
      FROM "fraud_monitor_scan_runs"
      ORDER BY "startedAt" DESC
      LIMIT ${HISTORY_LIMIT}
    `);

    const completedIds = rows.filter(row => row.status === 'COMPLETED').map(row => row.id);
    const checkRows = completedIds.length === 0 ? [] : await prisma.$queryRaw<Array<{
      scanRunId: string; checkCode: string; severity: 'critical' | 'warning' | 'info';
      findingCount: bigint | number | string; sampleCount: number;
    }>>(Prisma.sql`
      SELECT "scanRunId"::text AS "scanRunId", "checkCode", "severity", "findingCount", "sampleCount"
      FROM "fraud_monitor_check_snapshots"
      WHERE "scanRunId" IN (${Prisma.join(completedIds.map(id => Prisma.sql`${id}::uuid`))})
      ORDER BY "checkCode" ASC
    `);

    const checksByRun = new Map<string, FraudMonitorHistoryRun['checks']>();
    for (const row of checkRows) {
      const values = checksByRun.get(row.scanRunId) ?? [];
      values.push({ code: row.checkCode, severity: row.severity, count: toSafeCount(row.findingCount), sampleCount: row.sampleCount });
      checksByRun.set(row.scanRunId, values);
    }

    const runs: FraudMonitorHistoryRun[] = rows.map(row => ({
      id: row.id,
      trigger: row.trigger as FraudMonitorHistoryRun['trigger'],
      status: row.status as FraudMonitorHistoryRun['status'],
      executionPath: row.executionPath as FraudMonitorHistoryRun['executionPath'],
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      durationMillis: row.durationMillis,
      findingCount: toSafeCount(row.findingCount),
      bySeverity: {
        critical: toSafeCount(row.criticalCount),
        warning: toSafeCount(row.warningCount),
        info: toSafeCount(row.infoCount),
      },
      attempts: row.attempts,
      failureCode: row.failureCode,
      checks: checksByRun.get(row.id) ?? [],
    }));

    return { retentionDays: HISTORY_RETENTION_DAYS, runs, changes: buildFraudMonitorChanges(runs) };
  },

  pruneHistory: async (): Promise<number> => {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "fraud_monitor_scan_runs"
      SET "status" = 'FAILED', "completedAt" = NOW(),
          "failureCode" = 'STALE_RUN'
      WHERE "status" = 'RUNNING'
        AND "startedAt" < NOW() - (${RUNNING_STALE_MINUTES} * INTERVAL '1 minute')
    `);
    const deleted = await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "fraud_monitor_scan_runs"
      WHERE "status" <> 'RUNNING'
        AND "startedAt" < NOW() - (${HISTORY_RETENTION_DAYS} * INTERVAL '1 day')
    `);
    return deleted;
  },
};
