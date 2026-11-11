import morgan from 'morgan';
import type { Request } from 'express';
import { env } from '../config/env';
import { logger } from '../shared/observability/logger';

/**
 * HTTP access log. Registered BEFORE globalRateLimit on purpose:
 * express-rate-limit writes the 429 and terminates the chain, so a logger
 * placed after it would never see the requests most worth seeing (a per-IP
 * 429 is the signal that a legitimate user is hitting a shared-NAT bucket).
 * Infra endpoints that are hit on a schedule are skipped.
 *
 * 'combined' in production (no ANSI colors, structured for ELK/Datadog),
 * 'dev' everywhere else.
 */
const format = env.nodeEnv === 'production' ? 'combined' : 'dev';

const skip = (req: Request): boolean =>
  req.path === '/health' ||
  req.path === '/ready' ||
  req.path === '/live' ||
  req.path === '/metrics' ||
  req.path.startsWith('/api/docs');

export const requestLogger = morgan(format, {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
  skip,
});
