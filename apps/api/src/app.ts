import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import { Sentry } from './instrument';
import { router } from './routes';
import { env } from './config/env';
import { errorMiddleware } from './middlewares/error.middleware';
import { globalRateLimit } from './middlewares/rateLimit.middleware';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import { offlineOperationIdMiddleware } from './middlewares/offlineOperationId.middleware';
import { passport } from './modules/identity/auth/google.strategy';
import { internalGoWorkerRouter } from './modules/platform/internal-go-worker';
import { sendApiError } from './shared/errors/errorResponse';
import { ErrorCode } from './shared/errors/errorCodes';
import { databaseRequestContextMiddleware } from './shared/observability/dbQueryTelemetry';
import { metricsMiddleware, metricsHandler } from './shared/observability/metrics';
import { corsMiddleware } from './bootstrap/cors';
import { mountApiDocs } from './bootstrap/docs';
import { healthRouter } from './bootstrap/health.routes';
import { publicCacheInvalidation } from './bootstrap/publicCacheInvalidation.middleware';
import { requestLogger } from './bootstrap/requestLogging';

/**
 * Express application composition.
 *
 * This file only wires middleware in order; the pieces live in:
 *   - bootstrap/*                       cross-cutting HTTP concerns (CORS, health, docs, logging, cache purge)
 *   - middlewares/*                     reusable middleware (auth, rate limit, csrf, ...)
 *   - modules/platform/internal-go-worker        callbacks made by the Go worker
 *   - routes.ts                         the public /api/v1 route table
 *
 * ORDER MATTERS — each step below depends on the ones above it.
 */
const app = express();

// M-01: trust proxy as number (1 = one trusted hop: nginx/Cloudflare)
app.set('trust proxy', env.security.trustProxy);
// Keep Express's conditional GET behavior explicit: JSON responses receive
// weak ETags, and private `no-cache` routes can answer matching validators
// with 304 without exposing them to shared caches.
app.set('etag', 'weak');

// ── Security ──────────────────────────────────────────
app.use(helmet());
app.use(corsMiddleware);

// gzip/brotli-negotiated compression (threshold 1KB avoids compressing tiny
// health payloads; level 6 = size/CPU balance).
app.use(
  compression({
    threshold: 1024,
    level: 6,
    // SSE responses must be flushed as events arrive. Compression middleware can
    // buffer small chunks and delay heartbeats, making mobile clients report
    // `TypeError: Failed to fetch`/heartbeat timeouts on the notification stream.
    filter: (req, res) => {
      if (req.path.endsWith('/notifications/stream')) return false;
      return compression.filter(req, res);
    },
  })
);

// Parses the refreshToken/csrfToken cookies (see shared/auth/authCookies.ts)
// into req.cookies, before anything that reads a cookie (csrfProtection in
// routes.ts, authController.refresh/logout).
app.use(cookieParser());

// ── Passport ──────────────────────────────────────────
// Stateless only (session: false everywhere it's used) — no express-session is
// registered; passport.initialize() alone makes passport.authenticate(...)
// usable in auth.routes.ts.
app.use(passport.initialize());

// ── Request context ───────────────────────────────────
app.use(requestIdMiddleware);
app.use(databaseRequestContextMiddleware);

// Validate the optional offline idempotency key before any route consumes it.
// Missing headers are valid for ordinary online requests.
app.use(offlineOperationIdMiddleware);

// ── Metrics ───────────────────────────────────────────
// Registered before globalRateLimit so every request — including ones later
// rejected by the rate limiter — is counted, and so Prometheus scraping is
// exempt from the API rate limit.
app.use(metricsMiddleware);
app.get('/metrics', metricsHandler);

// ── Health & docs BEFORE globalRateLimit (M-03) ───────
app.use(healthRouter);
mountApiDocs(app);

// ── Logging (before globalRateLimit so 429s are logged) ──
app.use(requestLogger);

// ── Rate Limiting (API only) ──────────────────────────
app.use('/api', globalRateLimit);

// ── Parsing ───────────────────────────────────────────
// M-04: 50kb — largest legitimate JSON payload is ~10KB. Multipart (images) is
// handled separately by multer with its own limits.
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// ── Internal Go worker callbacks (token-authenticated, not under /api) ──
app.use('/internal/go-worker', internalGoWorkerRouter);

// ── API Routes ────────────────────────────────────────
app.use('/api/v1', publicCacheInvalidation);
app.use('/api/v1', router);

// ── 404 Handler ───────────────────────────────────────
app.use((req: Request, res: Response) => {
  sendApiError(req, res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Route not found');
});

// ── Sentry Error Handler ──────────────────────────────
// Must be registered AFTER all routes/the 404 handler (so it sees errors from
// real handlers) and BEFORE errorMiddleware (Sentry's documented ordering; it
// must see the original error since errorMiddleware doesn't re-throw). It is a
// no-op when instrument.ts never called Sentry.init() (no SENTRY_DSN).
Sentry.setupExpressErrorHandler(app);

// ── Error Handler ─────────────────────────────────────
app.use(errorMiddleware);

export { app };
