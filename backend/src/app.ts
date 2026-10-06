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
import { passport } from './modules/auth/google.strategy';
import { ForbiddenError } from './shared/errors/ForbiddenError';

const app = express();

// M-01: trust proxy as number (1 = one trusted hop: nginx/Cloudflare)
app.set('trust proxy', env.security.trustProxy);

// ── Security ──────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // T530-app — allowed origins were previously a hardcoded literal
      // list here (env.frontendUrl PLUS two baked-in URLs). That meant
      // a deployment that changed FRONTEND_URL still had the old
      // production URL pre-allowed in code, and any preview/staging
      // origin was rejected with no way to add it without editing this
      // file. Now the list is composed from env.frontendUrl plus any
      // comma-separated CORS_EXTRA_ORIGINS entry, so a deploy can add a
      // preview origin via env alone. The two historical defaults are
      // preserved here as a fallback ONLY when FRONTEND_URL is left at
      // its schema default ('http://localhost:3000') — i.e. in local
      // dev, where someone hitting the deployed Worker from a local
      // dev server is a legitimate case — so the production URL is not
      // silently allowed in a deploy that has properly set
      // FRONTEND_URL to something else.
      const extraOrigins = (env.security.corsExtraOrigins ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const devFallbacks =
        env.nodeEnv !== 'production'
          ? ['https://marketplat.esamnajjar6.workers.dev', 'http://localhost:3000']
          : [];
      const allowedOrigins = new Set<string>([
        env.frontendUrl,
        ...extraOrigins,
        ...devFallbacks,
      ]);
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        // A rejected origin is a client error (403), not a server fault.
        // Sending 500 here spammed Sentry with a false-positive issue on
        // every bot/scanner probe with an unknown Origin header.
        callback(new ForbiddenError('Not allowed by CORS', 'CORS_ORIGIN_REJECTED'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // X-CSRF-Token added — the frontend must be allowed
    // to send this header for csrf.middleware.ts's double-submit
    // cookie check to work (a browser blocks a cross-origin request
    // from setting a header not in this allowlist).
    // X-Offline-Op-Id (see frontend's
    // lib/offlineOperationId.ts) is sent on every ad/product/
    // service-listing create & edit request so the SW's offline queue
    // can link a queued mutation back to its local draft. Missing from
    // this allowlist, it silently failed the browser's CORS preflight
    // for exactly those requests — the request never left the browser,
    // which surfaced client-side as a bare network error (axios got no
    // response at all) indistinguishable from a real outage, even
    // though the device was online and every other endpoint (login,
    // GET routes, delete, markAsSold — none of which send this header)
    // worked normally.
    // Last-Event-ID: the SSE client resumes /notifications/stream with it (cross-origin → needs preflight approval).
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token', 'X-Offline-Op-Id', 'Last-Event-ID'],
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
// N3: threshold 1KB avoids compressing tiny health payloads; level 6 = size/CPU balance.
app.use(compression({ threshold: 1024, level: 6 }));

// parses the refreshToken/csrfToken cookies (see
// shared/utils/authCookies.ts) into req.cookies. Registered right
// after CORS/helmet, before anything that needs to read a cookie
// (csrfProtection in routes.ts, authController.refresh/logout).
app.use(cookieParser());

// ── Passport ────────────────────────────
// Stateless only (session: false everywhere it's used — see
// auth.routes.ts / google.strategy.ts's own comments) — no
// express-session is registered anywhere in this app, and none is
// needed: passport.initialize() alone is sufficient to make
// passport.authenticate(...) usable in auth.routes.ts; it does not by
// itself add any session/cookie behavior beyond what's already here.
app.use(passport.initialize());

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

// ── Logging ───────────────────────────────────────────
// morgan was previously registered AFTER
// globalRateLimit, with a comment claiming that ordering logged 429s.
// The opposite is true — express-rate-limit writes the 429 response
// and terminates the chain, so morgan (which sits below it) never runs
// for the requests most worth seeing. That was especially costly on
// Gaza's shared-NAT mobile links, where a per-IP 429 is the signal
// that a legitimate user is hitting the tower-wide bucket, and that
// signal was previously invisible in the logs. Registered here, before
// globalRateLimit, with an explicit skip for the infra endpoints that
// are meant to be hit on a schedule (probes / scraping) rather
// than by users.
//
// M-09: 'combined' in production (no ANSI colors, structured for
// ELK/Datadog); 'dev' everywhere else.
const morganFormat = env.nodeEnv === 'production' ? 'combined' : 'dev';
const morganSkip = (req: Request): boolean =>
  req.path === '/health' ||
  req.path === '/ready' ||
  req.path === '/live' ||
  req.path === '/metrics' ||
  req.path.startsWith('/api/docs');
app.use(
  morgan(morganFormat, {
    stream: { write: (msg: string) => logger.info(msg.trim()) },
    skip: morganSkip,
  })
);

// ── Rate Limiting (API only) ──────────────────────────
// M-03: scoped to /api only — health endpoints excluded
app.use('/api', globalRateLimit);

// ── Parsing ───────────────────────────────────────────
// M-04: 10mb → 50kb — largest legitimate JSON payload is ~10KB
// Multipart (images) is handled separately by multer with its own limits
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

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
// must be registered AFTER all routes/the 404 handler
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
