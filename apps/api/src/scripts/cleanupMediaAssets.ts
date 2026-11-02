/**
 * Durable Cloudinary cleanup queue. Go is the primary executor; this bounded
 * Express implementation is the fallback and shares the same advisory lock.
 * Only explicitly enqueued public IDs are deleted.
 */
import { prisma } from '../config/prisma';
import { deleteMedia } from '../config/cloudinary';
import { logger } from '../shared/utils/logger';
import { executeWithGoFallback, runAdvisoryLockedBatch } from '../shared/go-worker/executeWithFallback';

const MEDIA_CLEANUP_LOCK_ID = 731904302n;
const BATCH_SIZE = 30;
const MAX_BATCHES = 4;
const DELETE_CONCURRENCY = 6;
const MAX_ATTEMPTS = 12;
const LEASE_MS = 2 * 60 * 1000;
const RETAIN_COMPLETED_DAYS = 30;

type ResourceType = 'image' | 'video' | 'raw';
interface CleanupJob { id: string; publicId: string; resourceType: ResourceType; attempts: number; leaseToken: string; recovered: boolean; }
interface CleanupResult {
  scanned: number;
  deleted: number;
  retried: number;
  deadLettered: number;
  recoveredLeases: number;
  leaseLost: number;
  prunedCompleted: number;
  batches: number;
  limitReached: boolean;
  evaluatedAt: string;
}

function isResourceType(value: unknown): value is ResourceType {
  return value === 'image' || value === 'video' || value === 'raw';
}

function isResult(value: unknown): value is CleanupResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const counters = ['scanned', 'deleted', 'retried', 'deadLettered', 'recoveredLeases', 'leaseLost', 'prunedCompleted', 'batches'];
  return counters.every(key => Number.isSafeInteger(result[key]) && (result[key] as number) >= 0)
    && typeof result.limitReached === 'boolean'
    && typeof result.evaluatedAt === 'string'
    && Number.isFinite(Date.parse(result.evaluatedAt))
    && (result.deleted as number) + (result.retried as number) + (result.deadLettered as number) + (result.leaseLost as number) <= (result.scanned as number);
}

function backoffMs(attempt: number): number {
  let delay = 5 * 60 * 1000;
  for (let index = 1; index < Math.max(1, attempt) && delay < 24 * 60 * 60 * 1000; index += 1) delay *= 2;
  return Math.min(delay, 24 * 60 * 60 * 1000);
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const totals: CleanupResult = {
    scanned: 0, deleted: 0, retried: 0, deadLettered: 0,
    recoveredLeases: 0, leaseLost: 0, prunedCompleted: 0,
    batches: 0, limitReached: false, evaluatedAt: new Date().toISOString(),
  };

  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex += 1) {
    const batch = await runAdvisoryLockedBatch(
      prisma,
      MEDIA_CLEANUP_LOCK_ID,
      async tx => {
        const now = new Date();
        const jobs = await tx.$queryRaw<CleanupJob[]>`
          WITH candidates AS (
            SELECT "id", "status" AS "previousStatus"
            FROM "media_cleanup_jobs"
            WHERE (
              "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
            ) OR (
              "status" = 'PROCESSING' AND "lockedAt" <= ${new Date(now.getTime() - LEASE_MS)}
            )
            ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${BATCH_SIZE}
          )
          UPDATE "media_cleanup_jobs" AS jobs
          SET "status" = 'PROCESSING', "attempts" = jobs."attempts" + 1,
              "lockedAt" = ${now}, "leaseToken" = gen_random_uuid(), "updatedAt" = ${now}
          FROM candidates
          WHERE jobs."id" = candidates."id"
          RETURNING jobs."id"::text AS "id", jobs."publicId", jobs."resourceType",
                    jobs."attempts", jobs."leaseToken"::text AS "leaseToken",
                    (candidates."previousStatus" = 'PROCESSING') AS "recovered"
        `;

        let nextIndex = 0;
        const outcomes: Array<{ job: CleanupJob; error?: unknown }> = [];
        const worker = async (): Promise<void> => {
          for (;;) {
            const index = nextIndex++;
            if (index >= jobs.length) return;
            const job = jobs[index];
            if (!isResourceType(job.resourceType)) {
              outcomes[index] = { job, error: new Error('Unsupported Cloudinary resource type') };
              continue;
            }
            try {
              await deleteMedia(job.publicId, job.resourceType);
              outcomes[index] = { job };
            } catch (error) {
              outcomes[index] = { job, error };
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, jobs.length) }, worker));

        let deleted = 0, retried = 0, deadLettered = 0, leaseLost = 0, recoveredLeases = 0;
        for (const outcome of outcomes) {
          const { job, error } = outcome;
          if (job.recovered) recoveredLeases += 1;
          if (!isResourceType(job.resourceType)) {
            // A corrupt row must not be sent to Cloudinary. Quarantine it for
            // operator review and continue processing the remaining batch.
          }
          if (!error) {
            const updated = await tx.$executeRaw`
              UPDATE "media_cleanup_jobs"
              SET "status" = 'COMPLETED', "completedAt" = NOW(), "lockedAt" = NULL,
                  "leaseToken" = NULL, "lastError" = NULL, "updatedAt" = NOW()
              WHERE "id" = ${job.id}::uuid AND "leaseToken" = ${job.leaseToken}::uuid AND "status" = 'PROCESSING'
            `;
            if (updated === 1) deleted += 1;
            else leaseLost += 1;
            continue;
          }
          const dead = job.attempts >= MAX_ATTEMPTS || !isResourceType(job.resourceType);
          const message = (error instanceof Error ? error.message : String(error)).slice(0, 1800);
          const status = dead ? 'DEAD' : 'PENDING';
          const retryAt = dead ? now : new Date(now.getTime() + backoffMs(job.attempts));
          const updated = await tx.$executeRaw`
            UPDATE "media_cleanup_jobs"
            SET "status" = ${status}, "nextAttemptAt" = ${retryAt}, "lockedAt" = NULL,
                "leaseToken" = NULL, "lastError" = ${message}, "updatedAt" = NOW()
            WHERE "id" = ${job.id}::uuid AND "leaseToken" = ${job.leaseToken}::uuid AND "status" = 'PROCESSING'
          `;
          if (updated !== 1) leaseLost += 1;
          else if (dead) deadLettered += 1;
          else retried += 1;
        }

        const pruned = await tx.$executeRaw`
          DELETE FROM "media_cleanup_jobs"
          WHERE "id" IN (
            SELECT "id" FROM "media_cleanup_jobs"
            WHERE "status" = 'COMPLETED'
              AND "completedAt" < ${new Date(now.getTime() - RETAIN_COMPLETED_DAYS * 24 * 60 * 60 * 1000)}
            ORDER BY "completedAt" ASC LIMIT 500
          )
        `;
        return {
          scanned: jobs.length, deleted, retried, deadLettered, leaseLost,
          recoveredLeases, prunedCompleted: pruned,
        };
      },
      { transactionTimeoutMs: 90_000 },
    );

    if (!batch.acquired) return 'busy';
    totals.scanned += batch.value.scanned;
    totals.deleted += batch.value.deleted;
    totals.retried += batch.value.retried;
    totals.deadLettered += batch.value.deadLettered;
    totals.leaseLost += batch.value.leaseLost;
    totals.recoveredLeases += batch.value.recoveredLeases;
    totals.prunedCompleted += batch.value.prunedCompleted;
    if (batch.value.scanned === 0) break;
    totals.batches += 1;
    if (batch.value.scanned < BATCH_SIZE) break;
    if (batchIndex === MAX_BATCHES - 1) totals.limitReached = true;
  }

  logger.info('[cleanup-media-assets] Express fallback completed', totals);
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<CleanupResult>({
    jobName: 'cleanup-media-assets',
    path: '/internal/jobs/cleanup-media-assets',
    body: {},
    validateResult: isResult,
    runExpressFallback,
  });
}

main().catch(error => {
  logger.error('[cleanup-media-assets] job failed', { error });
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
