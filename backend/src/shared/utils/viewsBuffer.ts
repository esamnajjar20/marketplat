import { reportBackgroundFailure } from './backgroundTask';
import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { logger } from './logger';
import { env } from '../../config/env';

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
const MAX_KEYS_PER_FLUSH_BATCH = 100;
const MAX_CONCURRENT_DB_UPDATES = 20;

// Atomic GETDEL per key — avoids losing views that arrive between read and delete
const FLUSH_VIEWS_SCRIPT = `
local results = {}
for i, key in ipairs(KEYS) do
  results[i] = redis.call('GETDEL', key)
end
return results
`;

export const viewsBuffer = {
  /**
   * Increment view count in Redis buffer.
   * Accepts optional viewerKey for deduplication (IP-based).
   * Returns true if this was a new (non-duplicate) view.
   */
  increment: async (adId: string, viewerKey?: string): Promise<boolean> => {
    try {
      if (viewerKey) {
        // Deduplication: 1 view per viewerKey per hour
        const dedupKey = `views_dedup:${adId}:${viewerKey}`;
        const alreadySeen = await redis.exists(dedupKey);
        if (alreadySeen) return false;
        // Mark as seen for 1 hour
        await redis.setex(dedupKey, 3600, '1');
      }
      // Accumulate in buffer key. pipeline INCR + EXPIRE together
      // so the key's TTL is refreshed on every increment — it never sits
      // without an expiry, and active counters don't expire mid-accumulation
      // since each new view pushes the TTL back out.
      await redis
        .pipeline()
        .incr(`${VIEWS_PREFIX}${adId}`)
        .expire(`${VIEWS_PREFIX}${adId}`, VIEWS_BUFFER_TTL_SECONDS)
        .exec();
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
                    await redis.incrby(`${VIEWS_PREFIX}${adId}`, count);
                    await redis.expire(`${VIEWS_PREFIX}${adId}`, VIEWS_BUFFER_TTL_SECONDS);
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
      viewsBuffer
        .flush()
        .catch(error => reportBackgroundFailure('backend/src/shared/utils/viewsBuffer.ts', error));
    }, FLUSH_INTERVAL);
    flushTimer.unref(); // don't keep process alive
    logger.info(`Views buffer flush timer started (every ${FLUSH_INTERVAL / 1000}s)`);
  },

  stopFlushTimer: async (): Promise<void> => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    // Final flush on shutdown
    await viewsBuffer.flush();
  },
};

interface RedisEval {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}
