/**
 * Go-first cleanup for expired stories. Cloudinary media is deleted before the
 * database row; any Cloudinary or DB failure leaves the story row retryable.
 * Express keeps the SDK-based fallback and shares the worker's advisory lock.
 */
import { prisma } from '../config/prisma';
import { deleteImage } from '../config/cloudinary';
import { logger } from '../shared/utils/logger';
import { executeWithGoFallback, runAdvisoryLockedBatch } from '../shared/go-worker/executeWithFallback';

const STORY_CLEANUP_LOCK_ID = 731904300n;
const BATCH_SIZE = 50;
const MAX_BATCHES = 6;
const DELETE_CONCURRENCY = 8;

interface StoryCleanupResult {
  scanned: number;
  deleted: number;
  mediaDeleteFailed: number;
  rowDeleteFailed: number;
  batches: number;
  limitReached: boolean;
  evaluatedAt: string;
}

interface ExpiredStoryCandidate { id: string; mediaPublicId: string | null }

function isResult(value: unknown): value is StoryCleanupResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return ['scanned', 'deleted', 'mediaDeleteFailed', 'rowDeleteFailed', 'batches'].every(
    key => Number.isSafeInteger(result[key]) && (result[key] as number) >= 0,
  ) && typeof result.limitReached === 'boolean' &&
    typeof result.evaluatedAt === 'string' && Number.isFinite(Date.parse(result.evaluatedAt)) &&
    (result.deleted as number) <= (result.scanned as number);
}

async function deleteMediaWithBoundedConcurrency(rows: ExpiredStoryCandidate[]): Promise<string[]> {
  const deletedStoryIds: string[] = [];
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex++;
      if (index >= rows.length) return;
      const row = rows[index];
      if (row.mediaPublicId) {
        try {
          await deleteImage(row.mediaPublicId);
        } catch (error) {
          logger.warn('[cleanup-expired-stories] Cloudinary media deletion failed; story retained for retry', {
            storyId: row.id,
            error,
          });
          continue;
        }
      }
      deletedStoryIds.push(row.id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, rows.length) }, worker));
  return deletedStoryIds;
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const now = new Date();
  const attemptedIds: string[] = [];
  let scanned = 0;
  let deleted = 0;
  let mediaDeleteFailed = 0;
  let batches = 0;
  let limitReached = false;

  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex += 1) {
    const batch = await runAdvisoryLockedBatch(
      prisma,
      STORY_CLEANUP_LOCK_ID,
      async tx => {
        const rows = await tx.story.findMany({
          where: {
            expiresAt: { lte: now },
            ...(attemptedIds.length > 0 ? { id: { notIn: attemptedIds } } : {}),
          },
          select: { id: true, mediaPublicId: true },
          take: BATCH_SIZE,
          orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        });
        if (rows.length === 0) return { scanned: 0, deleted: 0, mediaDeleteFailed: 0, attemptedIds: [] as string[] };

        const successfulIds = await deleteMediaWithBoundedConcurrency(rows);
        const failedCount = rows.length - successfulIds.length;
        const result = successfulIds.length > 0
          ? await tx.story.deleteMany({ where: { id: { in: successfulIds }, expiresAt: { lte: now } } })
          : { count: 0 };
        return { scanned: rows.length, deleted: result.count, mediaDeleteFailed: failedCount, attemptedIds: rows.map(row => row.id) };
      },
      { transactionTimeoutMs: 90_000 },
    );

    if (!batch.acquired) {
      logger.info('[cleanup-expired-stories] Express fallback stopped; another runner owns the cleanup lock', {
        scanned, deleted, batches,
      });
      return 'busy';
    }

    scanned += batch.value.scanned;
    deleted += batch.value.deleted;
    mediaDeleteFailed += batch.value.mediaDeleteFailed;
    if (batch.value.scanned === 0) break;
    batches += 1;
    // Exclude every attempted row from later batches in this run. Failed media
    // deletions remain in the DB and are retried on the next scheduled run.
    attemptedIds.push(...batch.value.attemptedIds);
    if (batch.value.scanned < BATCH_SIZE) break;
    if (batchIndex === MAX_BATCHES - 1) limitReached = true;
  }

  logger.info('[cleanup-expired-stories] Express fallback completed', {
    scanned, deleted, mediaDeleteFailed, batches, limitReached, evaluatedAt: now.toISOString(),
  });
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<StoryCleanupResult>({
    jobName: 'cleanup-expired-stories',
    path: '/internal/jobs/cleanup-expired-stories',
    body: {},
    validateResult: isResult,
    runExpressFallback,
    onGoSuccess: async result => {
      if (result.mediaDeleteFailed > 0 || result.rowDeleteFailed > 0 || result.limitReached) {
        logger.warn('[cleanup-expired-stories] cleanup left retryable rows or reached its per-run ceiling', result);
      }
    },
  });
}

main().catch(error => {
  logger.error('[cleanup-expired-stories] job failed', { error });
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
