import { reportBackgroundFailure } from './backgroundTask';
import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { logger } from './logger';
import { env } from '../../config/env';
import crypto from 'crypto';
import { executeWithGoFallback, runAdvisoryLockedBatch, type GoWorkerOutcome } from '../go-worker/executeWithFallback';

const VIEWS_PREFIX = 'views_buffer:';
const VIEWS_INFLIGHT_KEY = 'views_buffer:inflight';
const FLUSH_INTERVAL = 60_000;
const VIEWS_BUFFER_TTL_SECONDS = 24 * 60 * 60;
const MAX_KEYS_PER_FLUSH_BATCH = 100;
const PENDING_BATCH_SCAN_COUNT = 25;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushInFlight: Promise<void> | null = null;
let workerFlushInFlight: Promise<GoWorkerOutcome> | null = null;
const VIEWS_BUFFER_LOCK_ID = 731904295n;

type ViewIncrement = { adId: string; count: number };
type PendingViewBatch = { id: string; payload: string };

function isViewsFlushResult(value: unknown): value is {
  keysScanned: number;
  adsUpdated: number;
  viewsApplied: number;
  keysRestored: number;
} {
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

// One Redis Lua transaction stages a recoverable batch before deleting the
// source counters. The hash is intentionally durable (no TTL): a worker crash
// or lost HTTP response cannot discard drained view increments.
const DRAIN_VIEW_BUFFER_SCRIPT = `
local pendingKey = KEYS[#KEYS]
local keyType = redis.call('TYPE', pendingKey)
if type(keyType) == 'table' then keyType = keyType.ok end
if keyType ~= 'none' and keyType ~= 'hash' then
  return redis.error_reply('views inflight key must be a Redis hash')
end
local increments = {}
for i = 1, (#KEYS - 1) do
  local value = redis.call('GET', KEYS[i])
  if value then
    local count = tonumber(value)
    if count and count > 0 then
      table.insert(increments, {
        adId = string.sub(KEYS[i], string.len(ARGV[2]) + 1),
        count = math.floor(count)
      })
    end
  end
end
local encoded = cjson.encode(increments)
if #increments > 0 then
  redis.call('HSET', pendingKey, ARGV[1], encoded)
end
for i = 1, (#KEYS - 1) do
  redis.call('DEL', KEYS[i])
end
return encoded
`;

async function applyPendingViewBatch(batch: PendingViewBatch): Promise<void> {
  let increments: ViewIncrement[];
  try {
    const parsed: unknown = JSON.parse(batch.payload);
    if (!Array.isArray(parsed)) throw new Error('payload must be an array');
    increments = parsed.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new Error('increment must be an object');
      const value = item as Record<string, unknown>;
      if (
        typeof value.adId !== 'string' || value.adId.length === 0 ||
        !Number.isSafeInteger(value.count) || (value.count as number) <= 0
      ) throw new Error('increment has invalid adId/count');
      return { adId: value.adId, count: value.count as number };
    });
  } catch (error) {
    // Do not delete malformed inflight data automatically. It is durable and
    // must be inspected rather than silently discarded as lost view counts.
    throw new Error(`Invalid pending view batch ${batch.id}: ${error instanceof Error ? error.message : 'invalid payload'}`);
  }

  await prisma.$transaction(async tx => {
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "view_buffer_flush_batches" ("id", "adCount", "viewsCount")
      VALUES (${batch.id}, ${increments.length}, ${increments.reduce((sum, item) => sum + item.count, 0)}::bigint)
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id"
    `;

    // The receipt and view increments commit together. If COMMIT succeeds but
    // its response is lost, retrying this same Redis batch sees the receipt and
    // skips the increment instead of double-counting it.
    if (inserted.length === 0 || increments.length === 0) return;

    await tx.$executeRaw`
      WITH increments AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(increments)}::jsonb)
          AS x("adId" text, "count" bigint)
      )
      UPDATE "ads" AS ad
      SET "views" = ad."views" + increments."count"
      FROM increments
      WHERE ad."id" = increments."adId" AND ad."status" <> 'DELETED'
    `;
  }, { maxWait: 5_000, timeout: 20_000 });

  // Acknowledgement happens only after the DB transaction commits. If Redis
  // executes HDEL but its reply is lost, the receipt remains as a harmless
  // orphan; if HDEL did not execute, the next retry is idempotent.
  await (redis as any).hdel(VIEWS_INFLIGHT_KEY, batch.id);
  // Keep the receipt as a durable deduplication tombstone. HSCAN can return
  // duplicate fields while Redis rehashes, and a lost HDEL response can be
  // ambiguous across process restarts.
}

async function processPendingViewBatches(): Promise<void> {
  let cursor = '0';
  do {
    const [nextCursor, fields] = (await (redis as any).hscan(
      VIEWS_INFLIGHT_KEY,
      cursor,
      'COUNT',
      String(PENDING_BATCH_SCAN_COUNT)
    )) as [string, string[]];
    cursor = nextCursor;
    if (!Array.isArray(fields) || fields.length % 2 !== 0) {
      throw new Error('Redis HSCAN returned malformed pending view batches');
    }
    for (let index = 0; index < fields.length; index += 2) {
      await applyPendingViewBatch({ id: fields[index], payload: fields[index + 1] });
    }
  } while (cursor !== '0');
}

export const viewsBuffer = {
  /**
   * Increment view count in Redis buffer.
   * Accepts optional viewerKey for deduplication (IP-based).
   * Returns true if this was a new (non-duplicate) view.
   */
  increment: async (adId: string, viewerKey?: string): Promise<boolean> => {
    try {
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
      return false;
    }
  },

  /** Drain Redis counters into durable inflight batches, then apply each batch
   * with a PostgreSQL receipt in the same transaction as the ad updates. */
  flush: async (): Promise<void> => {
    if (flushInFlight) return flushInFlight;
    const task = (async (): Promise<void> => {
      await Promise.resolve();
      try {
        await processPendingViewBatches();
        let cursor = '0';
        let totalBatches = 0;
        let totalViews = 0;

        do {
          const [nextCursor, keys] = (await (redis as any).scan(
            cursor,
            'MATCH',
            `${VIEWS_PREFIX}*`,
            'COUNT',
            MAX_KEYS_PER_FLUSH_BATCH
          )) as [string, string[]];
          cursor = nextCursor;
          const counterKeys = keys.filter((key: string) =>
            key.startsWith(VIEWS_PREFIX) && key !== VIEWS_INFLIGHT_KEY && key.length > VIEWS_PREFIX.length
          );
          if (counterKeys.length === 0) continue;

          const batchId = `api_${crypto.randomUUID()}`;
          const encoded = await (redis as any).eval(
            DRAIN_VIEW_BUFFER_SCRIPT,
            counterKeys.length + 1,
            ...counterKeys,
            VIEWS_INFLIGHT_KEY,
            batchId,
            VIEWS_PREFIX
          );
          if (typeof encoded !== 'string') {
            throw new Error('Redis view-buffer staging returned an unexpected response');
          }
          const batch = { id: batchId, payload: encoded };
          const parsed = JSON.parse(encoded) as ViewIncrement[];
          if (parsed.length > 0) {
            totalBatches += 1;
            totalViews += parsed.reduce((sum, item) => sum + item.count, 0);
            await applyPendingViewBatch(batch);
          }
        } while (cursor !== '0');

        // Pick up any batches whose HDEL acknowledgement was ambiguous.
        await processPendingViewBatches();
        if (totalBatches > 0) logger.debug('Views flushed from durable Redis batches', { totalBatches, totalViews });
      } catch (error) {
        logger.error('Views buffer flush failed; durable inflight batches were retained for retry', error);
        throw error;
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
      flushUsingWorker().catch(error => reportBackgroundFailure('apps/api/src/shared/utils/viewsBuffer.ts', error));
    }, FLUSH_INTERVAL);
    flushTimer.unref();
    logger.info(`Views buffer flush timer started (every ${FLUSH_INTERVAL / 1000}s)`);
  },

  stopFlushTimer: async (): Promise<void> => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    await flushUsingWorker();
  },
};

interface RedisEval {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

// Atomic deduplication and counter increment: a failed INCR cannot leave a
// viewer dedup key behind and silently suppress a later retry.
const INCREMENT_VIEW_SCRIPT = `
local dedupEnabled = ARGV[1] == '1'
if dedupEnabled then
  local claimed = redis.call('SET', KEYS[2], '1', 'EX', ARGV[2], 'NX')
  if not claimed then return 0 end
end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`;
