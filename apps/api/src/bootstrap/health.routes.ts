import { Router, type Request, type Response } from 'express';
import { env } from '../config/env';
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
