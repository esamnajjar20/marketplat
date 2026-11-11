import cors from 'cors';
import { env } from '../config/env';
import { ForbiddenError } from '../shared/errors/ForbiddenError';

/**
 * Allowed origins are composed from env.frontendUrl plus any comma-separated
 * CORS_EXTRA_ORIGINS entry, so a deploy can add a preview/staging origin via
 * env alone. The two historical defaults are allowed ONLY outside production
 * (local dev hitting a deployed Worker is a legitimate case) so the
 * production URL is never silently allowed in a properly configured deploy.
 */
function resolveAllowedOrigins(): Set<string> {
  const extraOrigins = (env.security.corsExtraOrigins ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const devFallbacks =
    env.nodeEnv !== 'production'
      ? ['https://marketplat.esamnajjar6.workers.dev', 'http://localhost:3000']
      : [];
  return new Set<string>([env.frontendUrl, ...extraOrigins, ...devFallbacks]);
}

/**
 * Request headers the browser is allowed to send cross-origin (a header not
 * listed here silently fails the CORS preflight and surfaces client-side as a
 * bare network error):
 *  - X-CSRF-Token: csrf.middleware.ts's double-submit cookie check.
 *  - X-Offline-Op-Id / Idempotency-Key: the offline mutation queue links a
 *    queued create/edit back to its local draft.
 *  - Last-Event-ID: the SSE client resumes /notifications/stream with it.
 */
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Request-Id',
  'X-CSRF-Token',
  'X-Offline-Op-Id',
  'Idempotency-Key',
  'Last-Event-ID',
];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || resolveAllowedOrigins().has(origin)) {
      callback(null, true);
      return;
    }
    // A rejected origin is a client error (403), not a server fault. Sending
    // 500 here spammed Sentry on every bot/scanner probe with an unknown Origin.
    callback(new ForbiddenError('Not allowed by CORS', 'CORS_ORIGIN_REJECTED'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: CORS_ALLOWED_HEADERS,
  exposedHeaders: ['X-Request-Id', 'X-Cache'],
});
