import express, { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
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
import { offlineOperationIdMiddleware } from './middlewares/offlineOperationId.middleware';
import { sendApiError } from './shared/errors/errorResponse';
import { ErrorCode } from './shared/errors/errorCodes';
import { logger } from './shared/utils/logger';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { getCachedReadiness } from './shared/utils/healthCache';
import { metricsMiddleware, metricsHandler } from './shared/utils/metrics';
import { passport } from './modules/auth/google.strategy';
import { ForbiddenError } from './shared/errors/ForbiddenError';
import { getProductionScheduledJobScript, runProductionScheduledJob } from './scripts/childJobRunner';
import { unreadNotificationsCache } from './shared/utils/unreadNotificationsCache';
import { publishNotificationEventsToMany } from './shared/utils/notificationStream';
import { pushService } from './shared/utils/pushService';
import { fcmPushService } from './shared/utils/fcmPushService';
import { fcmDeviceTokensRepository } from './shared/utils/fcmDeviceTokensRepository';
import { prisma } from './config/prisma';
import { publishDurableNotifications } from './shared/go-worker/publishDurableNotifications';

const app = express();

// M-01: trust proxy as number (1 = one trusted hop: nginx/Cloudflare)
app.set('trust proxy', env.security.trustProxy);
// Keep Express's conditional GET behavior explicit: JSON responses receive
// weak ETags, and private `no-cache` routes can answer matching validators
// with 304 without exposing them to shared caches.
app.set('etag', 'weak');

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
      const allowedOrigins = new Set<string>([env.frontendUrl, ...extraOrigins, ...devFallbacks]);
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
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-CSRF-Token',
      'X-Offline-Op-Id',
      'Last-Event-ID',
    ],
    exposedHeaders: ['X-Request-Id', 'X-Cache'],
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
app.use(compression({
  threshold: 1024,
  level: 6,
  // SSE responses must be flushed as events arrive. Compression middleware can
  // buffer small chunks and delay heartbeats, making mobile clients report
  // `TypeError: Failed to fetch`/heartbeat timeouts on the notification stream.
  filter: (req, res) => {
    if (req.path.endsWith('/notifications/stream')) return false;
    return compression.filter(req, res);
  },
}));

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

// Validate the optional offline idempotency key before any route consumes it.
// Missing headers are valid for ordinary online requests.
app.use(offlineOperationIdMiddleware);

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

// Internal adapter called only by the Go-owned scheduler. It accepts an
// allowlisted script name, never an arbitrary command/path, and executes the
// compiled production script so its existing Go-first/Express-fallback and
// post-commit hooks remain unchanged.
app.post('/internal/go-worker/run-scheduled-job', async (req: Request, res: Response) => {
  const expectedToken = process.env.GO_WORKER_TOKEN?.trim() ?? '';
  const authorization = req.get('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  const authorized =
    expected.length > 0 &&
    expected.length === supplied.length &&
    timingSafeEqual(expected, supplied);

  res.setHeader('Cache-Control', 'no-store');
  if (!authorized) {
    res.status(expectedToken ? 401 : 503).json({
      error: expectedToken ? 'unauthorized' : 'internal worker token is not configured',
    });
    return;
  }

  const body = req.body as { jobName?: unknown; scheduledFor?: unknown } | undefined;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(key => key !== 'jobName' && key !== 'scheduledFor') ||
    typeof body.jobName !== 'string' ||
    !getProductionScheduledJobScript(body.jobName) ||
    typeof body.scheduledFor !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.scheduledFor) ||
    Number.isNaN(Date.parse(`${body.scheduledFor}T00:00:00.000Z`)) ||
    new Date(`${body.scheduledFor}T00:00:00.000Z`).toISOString().slice(0, 10) !== body.scheduledFor
  ) {
    res.status(400).json({ error: 'invalid scheduled job request' });
    return;
  }

  const jobName = body.jobName;
  const scheduledFor = body.scheduledFor;
  const controller = new AbortController();
  const abortOnDisconnect = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.once('aborted', abortOnDisconnect);
  res.once('close', abortOnDisconnect);

  try {
    await runProductionScheduledJob(jobName, scheduledFor, controller.signal);
    if (!res.headersSent && !res.destroyed) {
      res.status(200).json({ jobName, scheduledFor, status: 'completed' });
    }
  } catch (error) {
    logger.error('Go-owned scheduled job adapter failed', {
      jobName,
      scheduledFor,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent && !res.destroyed) res.status(500).json({ error: 'scheduled job failed' });
  } finally {
    req.off('aborted', abortOnDisconnect);
    res.off('close', abortOnDisconnect);
  }
});

// Internal post-commit adapter used when Go owns Outbox processing. Database
// rows and push-dispatch intents have already committed in Go; Express retains
// Redis unread-cache invalidation and SSE/pub-sub because those publishers are
// process-aware and already coordinate API instances through Redis.
app.post('/internal/go-worker/publish-outbox-notifications', async (req: Request, res: Response) => {
  const expectedToken = process.env.GO_WORKER_TOKEN?.trim() ?? '';
  const authorization = req.get('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  const authorized = expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
  res.setHeader('Cache-Control', 'no-store');
  if (!authorized) {
    res.status(expectedToken ? 401 : 503).json({
      error: expectedToken ? 'unauthorized' : 'internal worker token is not configured',
    });
    return;
  }

  const body = req.body as { eventId?: unknown; notifications?: unknown } | undefined;
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (
    !isRecord(body) ||
    Object.keys(body).some(key => key !== 'eventId' && key !== 'notifications') ||
    typeof body.eventId !== 'string' ||
    body.eventId.length < 1 ||
    body.eventId.length > 128 ||
    !Array.isArray(body.notifications) ||
    body.notifications.length < 1 ||
    body.notifications.length > 50
  ) {
    res.status(400).json({ error: 'invalid outbox notification callback' });
    return;
  }

  const notifications: Array<{
    id: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
  }> = [];
  const notificationIds = new Set<string>();
  for (const value of body.notifications) {
    if (
      !isRecord(value) ||
      Object.keys(value).some(key => !['id', 'userId', 'type', 'title', 'body', 'data'].includes(key)) ||
      typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 128 ||
      typeof value.userId !== 'string' || value.userId.length < 1 || value.userId.length > 128 ||
      typeof value.type !== 'string' || value.type.length < 1 || value.type.length > 80 ||
      typeof value.title !== 'string' || value.title.length > 500 ||
      typeof value.body !== 'string' || value.body.length > 2_000 ||
      !(value.data === null || value.data === undefined || isRecord(value.data)) ||
      notificationIds.has(value.id)
    ) {
      res.status(400).json({ error: 'invalid outbox notification item' });
      return;
    }
    notificationIds.add(value.id);
    notifications.push({
      id: value.id,
      userId: value.userId,
      type: value.type,
      title: value.title,
      body: value.body,
      data: value.data === null || value.data === undefined ? null : value.data,
    });
  }

  const eventId = body.eventId;
  const recipientIds = Array.from(new Set(notifications.map(item => item.userId)));
  const invalidations = await Promise.allSettled(
    recipientIds.map(userId => unreadNotificationsCache.invalidate(userId))
  );
  const invalidationFailures = invalidations.filter(result => result.status === 'rejected').length;
  if (invalidationFailures > 0) {
    logger.warn('Go outbox callback unread-cache invalidation partially failed', {
      eventId,
      recipients: recipientIds.length,
      failures: invalidationFailures,
    });
  }

  try {
    await publishNotificationEventsToMany(notifications.map(item => ({
      userId: item.userId,
      event: {
        type: 'notification' as const,
        action: 'created' as const,
        notificationId: item.id,
        notificationType: item.type,
        title: item.title,
        body: item.body,
        data: item.data,
      },
    })));
    res.status(200).json({ eventId, published: notifications.length });
  } catch (error) {
    logger.warn('Go outbox callback SSE publish failed after durable commit', { eventId, error });
    res.status(202).json({ eventId, published: 0, durable: true });
  }
});

// Post-commit read-side fan-out for durable notifications created directly
// by Go jobs. The notification and push-dispatch rows are already committed;
// this endpoint only invalidates unread-count caches and publishes SSE events.
app.post('/internal/go-worker/publish-durable-notifications', async (req: Request, res: Response) => {
  const expectedToken = process.env.GO_WORKER_TOKEN?.trim() ?? '';
  const authorization = req.get('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  const authorized = expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
  res.setHeader('Cache-Control', 'no-store');
  if (!authorized) {
    res.status(expectedToken ? 401 : 503).json({
      error: expectedToken ? 'unauthorized' : 'internal worker token is not configured',
    });
    return;
  }

  const body = req.body as { notificationIds?: unknown } | undefined;
  if (
    !body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(key => key !== 'notificationIds') ||
    !Array.isArray(body.notificationIds) || body.notificationIds.length > 500
  ) {
    res.status(400).json({ error: 'invalid durable notification callback' });
    return;
  }
  const notificationIds: string[] = [];
  const seen = new Set<string>();
  for (const id of body.notificationIds) {
    if (typeof id !== 'string' || id.length < 1 || id.length > 128 || seen.has(id)) {
      res.status(400).json({ error: 'invalid durable notification ID' });
      return;
    }
    seen.add(id);
    notificationIds.push(id);
  }
  await publishDurableNotifications(prisma, notificationIds, 'inventory-monitor');
  res.status(200).json({ accepted: notificationIds.length });
});

// Readiness probe for the authenticated Go push worker. This confirms that
// the API's narrow provider adapter is deployed before Go is allowed to pause
// the Express fallback consumer.
app.get('/internal/go-worker/push-adapter/health', (req: Request, res: Response) => {
  const expectedToken = process.env.GO_WORKER_TOKEN?.trim() ?? '';
  const authorization = req.get('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  const authorized = expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
  res.setHeader('Cache-Control', 'no-store');
  if (!authorized) {
    res.status(expectedToken ? 401 : 503).json({ ready: false });
    return;
  }
  res.status(200).json({ ready: true });
});

// Internal per-target provider adapter used by the Go-owned durable push
// dispatcher. Go owns claims, target leases, retry timing and delivery ledger;
// Express retains the existing Web Push cryptography/VAPID implementation and
// the Firebase Admin fallback when Go does not have a valid service account.
app.post('/internal/go-worker/send-push-target', async (req: Request, res: Response) => {
  const expectedToken = process.env.GO_WORKER_TOKEN?.trim() ?? '';
  const authorization = req.get('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  const authorized = expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
  res.setHeader('Cache-Control', 'no-store');
  if (!authorized) {
    res.status(expectedToken ? 401 : 503).json({
      error: expectedToken ? 'unauthorized' : 'internal worker token is not configured',
    });
    return;
  }

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const body = req.body as Record<string, unknown> | undefined;
  const allowedTopLevel = new Set(['channel', 'userId', 'targetId', 'payload']);
  const payload = body && isRecord(body.payload) ? body.payload : null;
  const allowedPayload = new Set([
    'title', 'body', 'url', 'tag', 'image', 'type', 'urgent', 'bypassQuietHours',
  ]);
  const stringFieldValid = (key: string, max: number, required = false): boolean => {
    const value = payload?.[key];
    return required
      ? typeof value === 'string' && value.trim().length > 0 && value.length <= max
      : value === undefined || value === null || (typeof value === 'string' && value.length <= max);
  };
  if (
    !body || !isRecord(body) || Object.keys(body).some(key => !allowedTopLevel.has(key)) ||
    !['WEB_PUSH', 'FCM'].includes(String(body.channel)) ||
    typeof body.userId !== 'string' || body.userId.length < 1 || body.userId.length > 128 ||
    typeof body.targetId !== 'string' || body.targetId.length < 1 || body.targetId.length > 128 ||
    !payload || Object.keys(payload).some(key => !allowedPayload.has(key)) ||
    !stringFieldValid('title', 256, true) || !stringFieldValid('body', 4096) ||
    !stringFieldValid('url', 2048) || !stringFieldValid('tag', 256) ||
    !stringFieldValid('image', 2048) || !stringFieldValid('type', 80) ||
    (payload.urgent !== undefined && typeof payload.urgent !== 'boolean') ||
    (payload.bypassQuietHours !== undefined && typeof payload.bypassQuietHours !== 'boolean')
  ) {
    res.status(400).json({ error: 'invalid push target request' });
    return;
  }

  const pushPayload = {
    title: payload.title as string,
    body: (payload.body as string | undefined) ?? '',
    ...(typeof payload.url === 'string' ? { url: payload.url } : {}),
    ...(typeof payload.tag === 'string' ? { tag: payload.tag } : {}),
    ...(typeof payload.image === 'string' ? { image: payload.image } : {}),
    ...(typeof payload.type === 'string' ? { type: payload.type } : {}),
    ...(typeof payload.urgent === 'boolean' ? { urgent: payload.urgent } : {}),
    ...(typeof payload.bypassQuietHours === 'boolean'
      ? { bypassQuietHours: payload.bypassQuietHours }
      : {}),
  };

  try {
    let outcome: string;
    if (body.channel === 'WEB_PUSH') {
      outcome = await pushService.sendToSubscriptionForOutbox(
        body.targetId as string,
        body.userId as string,
        pushPayload
      );
    } else {
      const token = await fcmDeviceTokensRepository.findByIdForUser(
        body.targetId as string,
        body.userId as string
      );
      outcome = token
        ? await fcmPushService.sendToToken(token, {
            title: pushPayload.title,
            body: pushPayload.body,
            url: pushPayload.url,
            tag: pushPayload.tag,
          })
        : 'missing';
    }
    res.status(200).json({ outcome });
  } catch (error) {
    logger.warn('Go push provider adapter failed; durable target will retry', {
      channel: body.channel,
      targetId: body.targetId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(503).json({ error: 'push provider adapter unavailable' });
  }
});

// ── API Routes ────────────────────────────────────────
app.use('/api/v1', router);

// ── 404 Handler ───────────────────────────────────────
app.use((req: Request, res: Response) => {
  sendApiError(req, res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Route not found');
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
