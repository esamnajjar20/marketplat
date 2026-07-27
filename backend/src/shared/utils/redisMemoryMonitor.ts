import { redis } from '../../config/redis';
import { logger } from './logger';
import client from 'prom-client';
import { register } from './metrics';

/**
 * PROD-FIX-11: docker-compose.yml's Redis runs `maxmemory-policy
 * noeviction` — a deliberate, already-documented tradeoff (every key
 * this app writes carries an explicit TTL, so an LRU eviction policy
 * wouldn't meaningfully distinguish "safe to drop" from "must not
 * drop" either; noeviction instead makes running out of memory a loud,
 * visible write failure rather than silent data loss). That tradeoff
 * is only actually safe in practice if memory usage is being watched —
 * otherwise "loud failure" just means production writes (new
 * sessions, rate-limit counters, cache entries) start silently
 * failing the moment Redis hits `maxmemory`, discovered only when
 * something downstream breaks. This is the piece that was missing:
 * actual visibility into how close usage is to that ceiling, before
 * it's hit.
 *
 * Exposes:
 *   - redis_memory_used_bytes / redis_memory_max_bytes as Prometheus
 *     gauges (see metricsHandler / /metrics) — the numbers a real
 *     alert rule (e.g. "page if redis_memory_used_bytes /
 *     redis_memory_max_bytes > 0.9 for 5m") would actually need.
 *   - A boot-time-style logger.warn() when usage crosses 80% of
 *     maxmemory, so it's visible in logs even without Prometheus/
 *     Grafana wired up yet — same "opt-in monitoring, but not silent"
 *     pattern as capacityCheck.ts and PROD-FIX-10's Sentry check.
 *
 * Polls every 30s via INFO memory (a cheap, standard Redis command —
 * not a performance concern at this frequency) rather than reacting to
 * every write, since exact real-time precision doesn't matter for a
 * capacity trend that changes over minutes, not milliseconds.
 */

const POLL_INTERVAL_MS = 30_000;
const WARNING_THRESHOLD_RATIO = 0.8;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastWarnedAt = 0;
const WARNING_COOLDOWN_MS = 5 * 60 * 1000; // don't re-log the same warning more than once per 5 minutes

export const redisMemoryUsedBytes = new client.Gauge({
  name: 'redis_memory_used_bytes',
  help: 'Redis used_memory (bytes), as reported by INFO memory',
  registers: [register],
});

export const redisMemoryMaxBytes = new client.Gauge({
  name: 'redis_memory_max_bytes',
  help: 'Redis maxmemory configuration (bytes), as reported by INFO memory. 0 means unbounded.',
  registers: [register],
});

/**
 * Parses the subset of Redis's INFO memory section this module needs.
 * INFO's output is a flat "key:value\r\n" text format, not JSON — this
 * only reads the two fields required (used_memory, maxmemory), not a
 * full INFO parser, since that's all this module needs and a partial
 * parser is simpler to keep correct than a general-purpose one this
 * codebase doesn't otherwise need.
 */
function parseMemoryInfo(infoText: string): { usedBytes: number; maxBytes: number } {
  const usedMatch = infoText.match(/^used_memory:(\d+)/m);
  const maxMatch = infoText.match(/^maxmemory:(\d+)/m);
  return {
    usedBytes: usedMatch ? parseInt(usedMatch[1], 10) : 0,
    maxBytes: maxMatch ? parseInt(maxMatch[1], 10) : 0,
  };
}

async function pollOnce(): Promise<void> {
  try {
    const infoText = await redis.info('memory');
    const { usedBytes, maxBytes } = parseMemoryInfo(infoText);

    redisMemoryUsedBytes.set(usedBytes);
    redisMemoryMaxBytes.set(maxBytes);

    if (maxBytes <= 0) return; // unbounded (maxmemory=0) — no ratio to warn on

    const ratio = usedBytes / maxBytes;
    const now = Date.now();

    if (ratio >= WARNING_THRESHOLD_RATIO && now - lastWarnedAt > WARNING_COOLDOWN_MS) {
      lastWarnedAt = now;
      logger.warn(
        `⚠️  Redis memory usage at ${(ratio * 100).toFixed(1)}% of maxmemory ` +
        `(${usedBytes} / ${maxBytes} bytes). This Redis instance runs with ` +
        `maxmemory-policy=noeviction (see docker-compose.yml) — once maxmemory is ` +
        `reached, NEW WRITES WILL BE REJECTED (sessions, rate limiting, caching all ` +
        `depend on Redis writes succeeding). Raise REDIS_MAXMEMORY or investigate what's ` +
        `consuming space (a growing keyspace despite every key carrying a TTL would ` +
        `indicate a bug, not just organic growth) before this becomes a production incident.`,
        { usedBytes, maxBytes, ratio },
      );
    }
  } catch (err) {
    // Never let a monitoring failure affect the app itself — this is
    // observability, not a critical path. Logged, not thrown.
    logger.error('Redis memory monitor poll failed', err);
  }
}

export const redisMemoryMonitor = {
  start: (): void => {
    if (pollTimer) return;
    // Poll once immediately on start, rather than waiting the full
    // interval for the first data point — matters for short-lived
    // processes (tests, quick restarts) and for /metrics being
    // meaningful immediately after boot rather than showing 0 for the
    // first 30s.
    void pollOnce();
    pollTimer = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);
    pollTimer.unref(); // don't keep the process alive on this alone
    logger.info(`Redis memory monitor started (polling every ${POLL_INTERVAL_MS / 1000}s)`);
  },

  stop: (): void => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },
};
