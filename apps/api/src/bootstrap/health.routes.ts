import { Router, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { getCachedReadiness } from '../shared/observability/healthCache';
import { logger } from '../shared/observability/logger';

/**
 * Liveness / readiness probes. Mounted BEFORE the global rate limiter:
 * Kubernetes probes (every 5-10s) must not consume the API rate-limit quota.
 */
export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.nodeEnv,
  });
});

// getCachedReadiness is async and must never surface as an unhandled rejection.
healthRouter.get('/ready', async (req: Request, res: Response) => {
  try {
    const status = await getCachedReadiness();
    const isReady = status.db === 'ok' && status.redis === 'ok';
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not ready',
      ...status,
      requestId: req.requestId,
    });
  } catch (err) {
    logger.error('Health check failed', err);
    res.status(503).json({
      status: 'not ready',
      db: 'error',
      redis: 'error',
      requestId: req.requestId,
    });
  }
});

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.json({
    status: 'live',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid,
  });
});

/**
 * Transactional-outbox worker health (deployment verification).
 *
 * `runOutboxWorker.ts` is a SEPARATE process that does not start with server.ts, so a deployment that
 * only runs the HTTP service silently stops delivering notifications, activity events and cache
 * invalidation while every user write still succeeds. The API itself cannot see the worker process,
 * but it can see its effect: events that stay unprocessed. This probe reports that backlog.
 *
 *  - 200 `ok`        : nothing is waiting longer than the stale threshold.
 *  - 503 `degraded`  : an event has been due for > STALE_AFTER_MS (worker down/stuck) or dead-letters exist.
 *
 * Returns counts and ages only (no payloads / user data). When OUTBOX_HEALTH_TOKEN is set the caller must
 * send it in the `x-health-token` header; without the variable the probe is open like /ready.
 */
const OUTBOX_STALE_AFTER_MS = 5 * 60 * 1_000;
// Must match LEASE_SECONDS in shared/outbox/outbox.worker.ts: an event whose lease the worker is still
// renewing (heartbeat) is being processed, not overdue, however old its availableAt is.
const OUTBOX_LEASE_SECONDS = 120;
const OUTBOX_PROBE_CACHE_MS = 10_000;
// Cached metrics only: requestId is per-request and is attached when each response is built.
let outboxProbeCache: { at: number; body: Record<string, unknown>; status: number } | null = null;

function hasValidOutboxHealthToken(req: Request): boolean {
  const expected = process.env.OUTBOX_HEALTH_TOKEN?.trim();
  if (!expected) return true;
  const received = req.header('x-health-token') ?? '';
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

healthRouter.get('/health/outbox', async (req: Request, res: Response) => {
  if (!hasValidOutboxHealthToken(req)) {
    res.status(401).json({ status: 'unauthorized', requestId: req.requestId });
    return;
  }
  const now = Date.now();
  if (outboxProbeCache && now - outboxProbeCache.at < OUTBOX_PROBE_CACHE_MS) {
    res.status(outboxProbeCache.status).json({ ...outboxProbeCache.body, requestId: req.requestId });
    return;
  }
  try {
    const dueNow = new Date(now);
    const [pending, oldestDue, deadLetters, lastProcessed] = await Promise.all([
      prisma.outboxEvent.count({ where: { processedAt: null, deadLetterAt: null } }),
      prisma.outboxEvent.findFirst({
        where: {
          processedAt: null,
          deadLetterAt: null,
          availableAt: { lte: dueNow },
          // Same claimability test as the worker: unlocked or lease expired. A slow event held under a
          // live lease must not flip the probe to degraded while the worker is healthy.
          OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now - OUTBOX_LEASE_SECONDS * 1_000) } }],
        },
        orderBy: { availableAt: 'asc' },
        select: { availableAt: true },
      }),
      prisma.outboxEvent.count({ where: { deadLetterAt: { not: null }, processedAt: null } }),
      prisma.outboxEvent.findFirst({
        where: { processedAt: { not: null } },
        orderBy: { processedAt: 'desc' },
        select: { processedAt: true },
      }),
    ]);
    const oldestDueAgeMs = oldestDue ? Math.max(0, now - oldestDue.availableAt.getTime()) : 0;
    const stale = oldestDueAgeMs > OUTBOX_STALE_AFTER_MS;
    const degraded = stale || deadLetters > 0;
    const body = {
      status: degraded ? 'degraded' : 'ok',
      pending,
      oldestDueAgeSeconds: Math.round(oldestDueAgeMs / 1_000),
      deadLetters,
      lastProcessedAt: lastProcessed?.processedAt?.toISOString() ?? null,
      staleAfterSeconds: OUTBOX_STALE_AFTER_MS / 1_000,
      hint: stale
        ? 'Events are overdue: verify the separate outbox worker service is running (npm run worker:outbox:prod).'
        : deadLetters > 0
          ? 'Dead-lettered events need operator review (see outbox_events.last_error).'
          : undefined,
    };
    const status = degraded ? 503 : 200;
    outboxProbeCache = { at: now, body, status };
    res.status(status).json({ ...body, requestId: req.requestId });
  } catch (err) {
    logger.error('Outbox health probe failed', err);
    res.status(503).json({ status: 'unknown', requestId: req.requestId });
  }
});
