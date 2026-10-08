/**
 * Prometheus metrics registry.
 *
 * Exposes:
 *   - Default Node.js process metrics (CPU, memory, event loop lag, GC)
 *     via prom-client's collectDefaultMetrics — same data every
 *     Prometheus Node.js integration guide recommends as the baseline.
 *   - http_requests_total: a Counter labeled by method, route, and
 *     status code, so RPS and error-rate (5xx / total) can be derived
 *     directly in Prometheus/Grafana without scraping raw logs.
 *   - http_request_duration_seconds: a Histogram labeled by method and
 *     route, giving P50/P95/P99 latency per endpoint — the numbers this
 *     project's earlier "load testing" pass could only reason about from
 *     reading the code, not from real running numbers. This is what
 *     turns that from a guess into an observable, queryable metric.
 *   - redis_memory_used_bytes / redis_memory_max_bytes (,
 *     see shared/utils/redisMemoryMonitor.ts) — visibility into how
 *     close Redis is to docker-compose.yml's noeviction maxmemory
 *     ceiling, which otherwise silently rejects writes once hit.
 *
 * Route label uses req.route.path (Express's matched pattern, e.g.
 * '/ads/:id') rather than req.originalUrl — using the raw URL would
 * create a new label value per unique ad ID, category slug, etc.,
 * causing unbounded cardinality growth in the metrics store over time.
 */
import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env';
import { sendApiError } from '../errors/errorResponse';
import { ErrorCode } from '../errors/errorCodes';

// plain `!==` on secret tokens leaks timing
// information proportional to the length of the matching prefix,
// letting an attacker recover the token byte-by-byte over many
// requests. crypto.timingSafeEqual is constant-time, but requires
// equal-length buffers, so unequal lengths are rejected before ever
// reaching it (that early return itself doesn't leak byte-level
// value since the true token's length isn't secret).
function safeTokenEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export const register = new client.Registry();

// Default process/runtime metrics (CPU, memory, event loop lag, GC,
// active handles) — the standard baseline every Prometheus Node.js setup
// scrapes, prefixed so they're visually grouped in Grafana/dashboards.
client.collectDefaultMetrics({ register, prefix: 'app_' });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests, labeled by method, route, and status code',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

// Homepage rail health: counts feed *builds* (not requests — the feed is
// cached) where a recommendation rail came back shorter than
// HOME_RAIL_HEALTHY_MIN. A sustained rise for personalized=true is the
// signature of over-aggressive exclusion or a thin catalog; see
// home/home-feed.service.ts.
export const homeFeedShortRailTotal = new client.Counter({
  name: 'home_feed_short_rail_total',
  help: 'Home feed builds where a recommendation rail was shorter than the healthy minimum',
  labelNames: ['rail', 'personalized'] as const,
  registers: [register],
});

export const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'HTTP error responses grouped by low-cardinality status and stable error code',
  labelNames: ['method', 'route', 'status_code', 'error_code'] as const,
  registers: [register],
});

export const backgroundTaskFailuresTotal = new client.Counter({
  name: 'background_task_failures_total',
  help: 'Background task failures grouped by task type and terminal outcome',
  labelNames: ['task_type', 'outcome'] as const,
  registers: [register],
});

export const cacheWarmupTasksTotal = new client.Counter({
  name: 'cache_warmup_tasks_total',
  help: 'Public cache warming task outcomes by stable task name',
  labelNames: ['task', 'outcome'] as const,
  registers: [register],
});

export const cacheWarmupTaskDurationSeconds = new client.Histogram({
  name: 'cache_warmup_task_duration_seconds',
  help: 'Public cache warming task duration by stable task name',
  labelNames: ['task'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

export const backgroundTaskFailurePersistenceTotal = new client.Counter({
  name: 'background_task_failure_persistence_errors_total',
  help: 'Failures while persisting a failed background task record',
  labelNames: ['task_type'] as const,
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds, labeled by method and route',
  labelNames: ['method', 'route', 'status_code'] as const,
  // Buckets tuned for a typical REST API: fine-grained near the fast
  // path (5-100ms), coarser near the tail (500ms-5s) where slow queries
  // or Cloudinary/SMTP calls would show up.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/**
 * Resolves a low-cardinality label for the request's route.
 * Falls back to 'unmatched' for 404s (no route matched) so those don't
 * fall through to using the raw path, which would reintroduce the
 * unbounded-cardinality problem this whole label scheme exists to avoid.
 */
function resolveRouteLabel(req: Request): string {
  if (req.route?.path) {
    // req.baseUrl carries any mounted prefix (e.g. '/api/v1/ads'),
    // req.route.path carries the matched pattern relative to that
    // mount point (e.g. '/:id') — concatenated, this gives the full
    // logical route ('/api/v1/ads/:id') without any real ID ever
    // appearing in a label value.
    return `${req.baseUrl}${req.route.path}`;
  }
  return 'unmatched';
}

/**
 * Records request count + latency for every request that reaches this
 * middleware. Registered early in app.ts (right after requestIdMiddleware,
 * before routing) so it wraps every request — but it reads req.route
 * inside the res.on('finish', ...) callback, which only fires after the
 * response has actually completed, by which point Express has already
 * matched the route and set req.route/res.statusCode. Registration
 * order determines which requests get wrapped; read timing (inside
 * 'finish') is what makes req.route accurate despite that early mount.
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const route = resolveRouteLabel(req);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);

    if (res.statusCode >= 400) {
      const fallbackCode =
        res.statusCode === 400 ? 'BAD_REQUEST' :
        res.statusCode === 401 ? 'UNAUTHORIZED' :
        res.statusCode === 403 ? 'FORBIDDEN' :
        res.statusCode === 404 ? 'RESOURCE_NOT_FOUND' :
        res.statusCode === 409 ? 'CONFLICT' :
        res.statusCode === 422 ? 'UNPROCESSABLE_ENTITY' :
        res.statusCode === 429 ? 'RATE_LIMIT_EXCEEDED' :
        res.statusCode === 503 ? 'SERVICE_UNAVAILABLE' :
        res.statusCode >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
      const responseCode = typeof res.locals?.errorCode === 'string' ? res.locals.errorCode : fallbackCode;
      httpErrorsTotal.inc({
        method: req.method,
        route: route.length <= 200 ? route : 'unmatched',
        status_code: String(res.statusCode),
        error_code: responseCode.slice(0, 100),
      });
    }
  });

  next();
};

/**
 * GET /metrics handler — returns the current registry snapshot in
 * Prometheus text exposition format.
 *
 * previously always unauthenticated, on the reasoning
 * that this mirrors /health and /ready (meant to be scraped by infra,
 * not end users). That's still true in principle, but no reverse-proxy
 * or network-policy allowlist exists anywhere in this repo to actually
 * enforce "infra only" — so by default this was reachable by anyone
 * who requested the URL, and would reveal internal route structure
 * (every req.route label value ever observed).
 *
 * If env.observability.metricsToken is set, this now requires it via
 * `Authorization: Bearer <token>` and returns 401 otherwise. If unset
 * (the default, matching every previous behavior in dev/test/an
 * already-network-restricted deployment), this is a no-op and
 * /metrics stays exactly as open as before — same "opt-in, does
 * nothing extra by default" pattern as SENTRY_DSN / SMTP_* / CLOUDINARY_*
 * elsewhere in this config. A reverse-proxy allowlist is still the
 * more robust a real production deployment; this is a
 * zero-infra baseline for anyone who hasn't set one up.
 */
export const metricsHandler = async (req: Request, res: Response): Promise<void> => {
  const requiredToken = env.observability.metricsToken;
  if (requiredToken) {
    const authHeader = req.headers.authorization;
    const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!providedToken || !safeTokenEquals(providedToken, requiredToken)) {
      sendApiError(req, res, 401, ErrorCode.UNAUTHORIZED, 'Unauthorized');
      return;
    }
  }

  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
};
