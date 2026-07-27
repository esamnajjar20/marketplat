import express, { Express, Request, Response } from 'express';
import request from 'supertest';
import {
  register,
  metricsMiddleware,
  metricsHandler,
  httpRequestsTotal,
  httpRequestDurationSeconds,
} from '../../src/shared/utils/metrics';

/**
 * Coverage for metrics.ts. Uses a minimal standalone express app (not
 * the full src/app.ts) so this suite can assert on route-label
 * resolution precisely, independent of the real app's actual routes.
 *
 * register.resetMetrics() between tests avoids counts leaking across
 * assertions — each test needs to reason about an exact counter value.
 */
describe('metrics', () => {
  beforeEach(() => {
    register.resetMetrics();
  });

  function buildApp(): Express {
    const app = express();
    app.use(metricsMiddleware);
    app.get('/widgets/:id', (req: Request, res: Response) => {
      res.status(200).json({ id: req.params.id });
    });
    app.get('/error-route', (_req: Request, res: Response) => {
      res.status(500).json({ error: true });
    });
    app.get('/metrics', metricsHandler);
    // No matching route registered for anything else — falls through
    // to Express's default 404, exercising the 'unmatched' route label.
    return app;
  }

  it('records a request against a parameterized route using the route pattern, not the raw URL', async () => {
    const app = buildApp();
    await request(app).get('/widgets/abc-123');

    const metricValue = await httpRequestsTotal.get();
    const sample = metricValue.values.find(
      (v) => v.labels.route === '/widgets/:id' && v.labels.method === 'GET',
    );

    expect(sample).toBeDefined();
    expect(sample?.value).toBe(1);
    // Critically: the raw ID must NOT appear as its own label value —
    // that would be the unbounded-cardinality bug this design avoids.
    const leakedIdLabel = metricValue.values.find((v) => v.labels.route === '/widgets/abc-123');
    expect(leakedIdLabel).toBeUndefined();
  });

  it('labels two different IDs hitting the same route as the same route label (no cardinality blowup)', async () => {
    const app = buildApp();
    await request(app).get('/widgets/abc-123');
    await request(app).get('/widgets/xyz-789');

    const metricValue = await httpRequestsTotal.get();
    const sample = metricValue.values.find((v) => v.labels.route === '/widgets/:id');

    expect(sample?.value).toBe(2);
  });

  it('records the correct status_code label for a 500 response', async () => {
    const app = buildApp();
    await request(app).get('/error-route');

    const metricValue = await httpRequestsTotal.get();
    const sample = metricValue.values.find(
      (v) => v.labels.route === '/error-route' && v.labels.status_code === '500',
    );

    expect(sample?.value).toBe(1);
  });

  it('labels requests to unmatched routes as "unmatched" rather than the raw path', async () => {
    const app = buildApp();
    await request(app).get('/this-route-does-not-exist');

    const metricValue = await httpRequestsTotal.get();
    const sample = metricValue.values.find((v) => v.labels.route === 'unmatched');

    expect(sample).toBeDefined();
    expect(sample?.labels.status_code).toBe('404');
  });

  it('observes request duration in the histogram for a matched route', async () => {
    const app = buildApp();
    await request(app).get('/widgets/1');

    const histValue = await httpRequestDurationSeconds.get();
    const countSample = histValue.values.find(
      (v) => v.metricName === 'http_request_duration_seconds_count' && v.labels.route === '/widgets/:id',
    );

    expect(countSample?.value).toBe(1);
  });

  describe('GET /metrics', () => {
    it('returns Prometheus exposition format including the default process metrics', async () => {
      const app = buildApp();
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      // app_ prefix from collectDefaultMetrics({ prefix: 'app_' })
      expect(res.text).toMatch(/app_process_cpu_user_seconds_total/);
    });

    it('includes http_requests_total after at least one request has been recorded', async () => {
      const app = buildApp();
      await request(app).get('/widgets/1');
      const res = await request(app).get('/metrics');

      expect(res.text).toMatch(/http_requests_total/);
      expect(res.text).toMatch(/route="\/widgets\/:id"/);
    });
  });

  /**
   * PROD-FIX-03: coverage for the new optional METRICS_TOKEN gate.
   * env.ts reads process.env once at module-load time, so each test
   * here sets METRICS_TOKEN *before* resetting modules and re-importing
   * both config/env and shared/utils/metrics fresh — the only way to
   * exercise a specific token value per test rather than whatever was
   * set at the very first import across the whole suite.
   */
  describe('GET /metrics — METRICS_TOKEN gate', () => {
    const ORIGINAL_METRICS_TOKEN = process.env.METRICS_TOKEN;

    afterEach(() => {
      if (ORIGINAL_METRICS_TOKEN === undefined) {
        delete process.env.METRICS_TOKEN;
      } else {
        process.env.METRICS_TOKEN = ORIGINAL_METRICS_TOKEN;
      }
      jest.resetModules();
    });

    it('stays unauthenticated when METRICS_TOKEN is not set (default/back-compat behavior)', async () => {
      delete process.env.METRICS_TOKEN;
      jest.resetModules();

      const metrics = await import('../../src/shared/utils/metrics');
      const app = express();
      app.get('/metrics', metrics.metricsHandler);

      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
    });

    it('rejects requests with no Authorization header when METRICS_TOKEN is set', async () => {
      process.env.METRICS_TOKEN = 'test-secret-token';
      jest.resetModules();

      const metrics = await import('../../src/shared/utils/metrics');
      const app = express();
      app.get('/metrics', metrics.metricsHandler);

      const res = await request(app).get('/metrics');
      expect(res.status).toBe(401);
    });

    it('rejects requests with the wrong token when METRICS_TOKEN is set', async () => {
      process.env.METRICS_TOKEN = 'test-secret-token';
      jest.resetModules();

      const metrics = await import('../../src/shared/utils/metrics');
      const app = express();
      app.get('/metrics', metrics.metricsHandler);

      const res = await request(app).get('/metrics').set('Authorization', 'Bearer wrong-token');
      expect(res.status).toBe(401);
    });

    it('allows requests with the correct Bearer token when METRICS_TOKEN is set', async () => {
      process.env.METRICS_TOKEN = 'test-secret-token';
      jest.resetModules();

      const metrics = await import('../../src/shared/utils/metrics');
      const app = express();
      app.get('/metrics', metrics.metricsHandler);

      const res = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer test-secret-token');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
    });
  });
});
