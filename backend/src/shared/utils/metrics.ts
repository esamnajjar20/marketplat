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
 *   - redis_memory_used_bytes / redis_memory_max_bytes (PROD-FIX-11,
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

// AUDIT-FIX M-03: plain `!==` on secret tokens leaks timing
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
  });

  next();
};

/**
 * GET /metrics handler — returns the current registry snapshot in
 * Prometheus text exposition format.
 *
 * PROD-FIX-03: previously always unauthenticated, on the reasoning
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
 * more robust fix for a real production deployment; this is a
 * zero-infra baseline for anyone who hasn't set one up.
 */
export const metricsHandler = async (req: Request, res: Response): Promise<void> => {
  const requiredToken = env.observability.metricsToken;
  if (requiredToken) {
    const authHeader = req.headers.authorization;
    const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!providedToken || !safeTokenEquals(providedToken, requiredToken)) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
  }

  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
};
