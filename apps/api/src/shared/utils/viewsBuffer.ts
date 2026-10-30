import { reportBackgroundFailure } from './backgroundTask';
import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { logger } from './logger';
import { env } from '../../config/env';
import { executeWithGoFallback, runAdvisoryLockedBatch, type GoWorkerOutcome } from '../go-worker/executeWithFallback';

const VIEWS_PREFIX = 'views_buffer:';
const FLUSH_INTERVAL = 60_000; // flush to DB every 60 seconds
// safety-net TTL on the buffer counter key. Without this, if
// flush() throws before reaching its GETDEL step (e.g. a transient Redis
// error), the key has no expiry and persists indefinitely — silently
// growing the keyspace and delaying those views from ever reaching
// Postgres until some future successful flush happens to pick them up.
// 24h is generous: far longer than the 60s normal flush interval, so it
// only matters as a fallback under real Redis instability.
const VIEWS_BUFFER_TTL_SECONDS = 24 * 60 * 60;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushInFlight: Promise<void> | null = null;
let workerFlushInFlight: Promise<GoWorkerOutcome> | null = null;
const VIEWS_BUFFER_LOCK_ID = 731904295n;

function isViewsFlushResult(value: unknown): value is { keysScanned: number; adsUpdated: number; viewsApplied: number; keysRestored: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return ['keysScanned', 'adsUpdated', 'viewsApplied', 'keysRestored'].every(key =>
    typeof result[key] === 'number' && Number.isFinite(result[key])
  );
}

async function flushUsingWorker(): Promise<GoWorkerOutcome> {
  if (workerFlushInFlight) return workerFlushInFlight;
  const task = (async () => {
    return executeWithGoFallback({
      jobName: 'views-buffer-flush',
      path: '/internal/jobs/views-buffer-flush',
      body: {},
      validateResult: isViewsFlushResult,
      timeoutMs: 8_000,
      runExpressFallback: async () => {
        const outcome = await runAdvisoryLockedBatch(
          prisma,
          VIEWS_BUFFER_LOCK_ID,
          async () => viewsBuffer.flush(),
          { maxWaitMs: 2_000, transactionTimeoutMs: 95_000 }
        );
        return outcome.acquired ? 'completed' : 'busy';
      },
    });
  })();
  workerFlushInFlight = task;
  try {
    return await task;
  } finally {
    if (workerFlushInFlight === task) workerFlushInFlight = null;
  }
}
const MAX_KEYS_PER_FLUSH_BATCH = 100;
const MAX_CONCURRENT_DB_UPDATES = 20;

// Atomically deduplicate a viewer and increment the counter. Keeping these
// operations in one Lua script prevents a failed INCR from leaving a dedup key
// behind for an hour (which would silently discard the viewer's retry).
const INCREMENT_VIEW_SCRIPT = `
-- VIEWS_DEDUP_INCREMENT
local dedupEnabled = ARGV[1] == '1'
if dedupEnabled then
  local claimed = redis.call('SET', KEYS[2], '1', 'EX', ARGV[2], 'NX')
  if not claimed then return 0 end
end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`;

// Atomic GETDEL per key — avoids losing views that arrive between read and delete
const FLUSH_VIEWS_SCRIPT = `
local results = {}
for i, key in ipairs(KEYS) do
  results[i] = redis.call('GETDEL', key)
end
return results
`;

// Restore a drained counter atomically after a database write fails. A separate
// INCRBY then EXPIRE can leave a permanent key if the second command fails.
const RESTORE_VIEW_BUFFER_SCRIPT = `
-- VIEWS_RESTORE_BUFFER
local count = redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return count
`;

export const viewsBuffer = {
  /**
   * Increment view count in Redis buffer.
   * Accepts optional viewerKey for deduplication (IP-based).
   * Returns true if this was a new (non-duplicate) view.
   */
  increment: async (adId: string, viewerKey?: string): Promise<boolean> => {
    try {
      // The dedup claim and counter increment must be one atomic operation.
      // A separate SET NX followed by pipeline INCR can permanently suppress
      // a retry for an hour if the increment fails after the claim succeeds.
      // Use an unused-but-valid second key when deduplication is disabled; the
      // Lua script never touches it unless ARGV[1] is '1'.
      const dedupEnabled = Boolean(viewerKey);
      const dedupKey = dedupEnabled
        ? `views_dedup:${adId}:${viewerKey}`
        : `views_dedup_disabled:${adId}`;
      const incremented = await (redis as any).eval(
        INCREMENT_VIEW_SCRIPT,
        2,
        `${VIEWS_PREFIX}${adId}`,
        dedupKey,
        dedupEnabled ? '1' : '0',
        '3600',
        String(VIEWS_BUFFER_TTL_SECONDS)
      );
      if (Number(incremented) !== 1) return false;
      if (env.nodeEnv === 'test') {
        await prisma.ad.updateMany({
          where: { id: adId, status: { not: 'DELETED' } },
          data: { views: { increment: 1 } },
        });
      }
      return true;
    } catch {
      // Redis unavailable — skip silently (views are not critical)
      return false;
    }
  },

  /**
   * Flush all buffered view counts to the database.
   * Called on a timer and on graceful shutdown.
   */
  flush: async (): Promise<void> => {
    // setInterval does not wait for an async callback. Reuse the active
    // flush promise so a slow database cannot trigger overlapping drains.
    if (flushInFlight) return flushInFlight;

    // Assign flushInFlight SYNCHRONOUSLY so concurrent flush() callers in
    // the same tick all share one task. Body still runs as a microtask so
    // the assignment is visible before scan/eval executes.
    const task = (async (): Promise<void> => {
      // Yield once so any other flush() that entered in this tick sees
      // flushInFlight already set and joins this same promise.
      await Promise.resolve();
      try {
        let cursor = '0';
        let totalAds = 0;
        let totalViews = 0;

        // Process SCAN results incrementally instead of retaining every key
        // and sending an unbounded Lua/SQL burst when the keyspace is large.
        do {
          const [nextCursor, keys] = (await (redis as any).scan(
            cursor,
            'MATCH',
            `${VIEWS_PREFIX}*`,
            'COUNT',
            MAX_KEYS_PER_FLUSH_BATCH
          )) as [string, string[]];
          cursor = nextCursor;
          if (keys.length === 0) continue;

          const rawCounts = (await (redis as RedisEval).eval(
            FLUSH_VIEWS_SCRIPT,
            keys.length,
            ...keys
          )) as (string | null)[];

          const updates = keys
            .map((key, i) => ({
              adId: key.slice(VIEWS_PREFIX.length),
              count: parseInt(rawCounts[i] || '0', 10),
            }))
            .filter(({ count }) => count > 0);

          // Bound database concurrency; each failed write restores its
          // counter, including views that arrived after the atomic GETDEL.
          for (let offset = 0; offset < updates.length; offset += MAX_CONCURRENT_DB_UPDATES) {
            const batch = updates.slice(offset, offset + MAX_CONCURRENT_DB_UPDATES);
            await Promise.all(
              batch.map(async ({ adId, count }) => {
                try {
                  await prisma.ad.updateMany({
                    where: { id: adId, status: { not: 'DELETED' } },
                    data: { views: { increment: count } },
                  });
                  totalAds++;
                  totalViews += count;
                } catch (err) {
                  logger.warn('Views update failed — restoring buffer count for retry', {
                    adId,
                    count,
                    err,
                  });
                  try {
                    await (redis as any).eval(
                      RESTORE_VIEW_BUFFER_SCRIPT,
                      1,
                      `${VIEWS_PREFIX}${adId}`,
                      String(count),
                      String(VIEWS_BUFFER_TTL_SECONDS)
                    );
                  } catch (restoreErr) {
                    logger.error(
                      'Views update failed AND buffer restore failed — those views are permanently lost',
                      { adId, count, restoreErr }
                    );
                  }
                }
              })
            );
          }
        } while (cursor !== '0');

        if (totalAds > 0) {
          logger.debug(`Views flushed: ${totalAds} ads, ${totalViews} total views`);
        }
      } catch (err) {
        logger.error('Views buffer flush failed', err);
      }
    })();

    flushInFlight = task;
    try {
      await task;
    } finally {
      if (flushInFlight === task) flushInFlight = null;
    }
  },

  startFlushTimer: (): void => {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
      flushUsingWorker()
        .catch(error => reportBackgroundFailure('apps/api/src/shared/utils/viewsBuffer.ts', error));
    }, FLUSH_INTERVAL);
    flushTimer.unref(); // don't keep process alive
    logger.info(`Views buffer flush timer started (every ${FLUSH_INTERVAL / 1000}s)`);
  },

  stopFlushTimer: async (): Promise<void> => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    // Final flush on shutdown still uses the same Go-first / Express fallback path.
    await flushUsingWorker();
  },
};

interface RedisEval {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}
