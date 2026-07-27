import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { Sentry } from './instrument';
import { router } from './routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { globalRateLimit } from './middlewares/rateLimit.middleware';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import { logger } from './shared/utils/logger';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { getCachedReadiness } from './shared/utils/healthCache';
import { metricsMiddleware, metricsHandler } from './shared/utils/metrics';

const app = express();

// M-01: trust proxy as number (1 = one trusted hop: nginx/Cloudflare)
app.set('trust proxy', env.security.trustProxy);

// ── Security ──────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    // PROD-FIX-15: X-CSRF-Token added — the frontend must be allowed
    // to send this header for csrf.middleware.ts's double-submit
    // cookie check to work (a browser blocks a cross-origin request
    // from setting a header not in this allowlist).
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-Id'],
  })
);

// L-1 (audit fix): gzip/brotli-negotiated compression for JSON
// responses (ad lists, admin tables) — previously nothing in the
// Express stack or the reference nginx config compressed responses,
// so every list response went out uncompressed, a measurable cost
// especially on mobile connections. Registered early (right after
// helmet/cors, before routes) so it applies to every response body
// written afterward; /health, /ready, /live, /metrics stay tiny plain
// text so compressing them isn't harmful, just unnecessary — not worth
// a filter exception. Cheap CPU/response-size tradeoff at this scale.
app.use(compression());

// PROD-FIX-15: parses the refreshToken/csrfToken cookies (see
// shared/utils/authCookies.ts) into req.cookies. Registered right
// after CORS/helmet, before anything that needs to read a cookie
// (csrfProtection in routes.ts, authController.refresh/logout).
app.use(cookieParser());

// ── Request ID ────────────────────────────────────────
app.use(requestIdMiddleware);

// ── Metrics ───────────────────────────────────────────
// Registered here (before globalRateLimit, same as /health/ready/live
// below) so every request — including ones later rejected by the rate
// limiter — is counted. Scraping itself must also be exempt from the
// API rate limit, same reasoning as Kubernetes probes: Prometheus hits
// this endpoint on its own schedule (typically every 15-30s) and that
// traffic has nothing to do with real API usage.
app.use(metricsMiddleware);
app.get('/metrics', metricsHandler);

// ── M-03: Health & Docs BEFORE globalRateLimit ────────
// Kubernetes probes (every 5-10s) must not consume the API rate limit quota
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.nodeEnv,
  });
});

// M-02: wrap in try/catch — getCachedReadiness is async and must not throw unhandled
app.get('/ready', async (req: Request, res: Response) => {
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

app.get('/live', (_req: Request, res: Response) => {
  res.json({
    status: 'live',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid,
  });
});

// Swagger docs are available outside production only.
if (env.nodeEnv !== 'production') {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Classifieds Platform API',
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerOptions: { persistAuthorization: true },
    })
  );

  app.get('/api/docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// ── Rate Limiting (API only) ──────────────────────────
// M-03: scoped to /api only — health endpoints excluded
app.use('/api', globalRateLimit);

// ── Parsing ───────────────────────────────────────────
// M-04: 10mb → 50kb — largest legitimate JSON payload is ~10KB
// Multipart (images) is handled separately by multer with its own limits
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// ── Logging ───────────────────────────────────────────
// M-09: use 'combined' in production (no ANSI colors, structured for ELK/Datadog)
// morgan registered AFTER rate limit so 429s are logged too
const morganFormat = env.nodeEnv === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: { write: (msg: string) => logger.info(msg.trim()) },
  })
);

// ── API Routes ────────────────────────────────────────
app.use('/api/v1', router);

// ── 404 Handler ───────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    statusCode: 404,
    requestId: req.requestId,
  });
});

// ── Sentry Error Handler ──────────────────────────────
// FIX APM-02: must be registered AFTER all routes/the 404 handler
// above (so it sees errors from real route handlers) and BEFORE
// errorMiddleware below (Sentry's own documented ordering requirement —
// it needs to run before "any other error-handling middleware" so it
// still sees the original error, since errorMiddleware sends the
// response and doesn't re-throw). Sentry.setupExpressErrorHandler is a
// no-op if instrument.ts never called Sentry.init() (no SENTRY_DSN
// configured), so this is always safe to register unconditionally.
Sentry.setupExpressErrorHandler(app);

// ── Error Handler ─────────────────────────────────────
app.use(errorMiddleware);

export { app };
