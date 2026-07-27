import request from 'supertest';
import { app } from '../../src/app';

describe('Health & Docs endpoints', () => {
  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.uptime).toBeDefined();
    });
  });

  describe('GET /ready', () => {
    it('returns readiness with db and redis status', async () => {
      const res = await request(app).get('/ready');

      expect([200, 503]).toContain(res.status);
      expect(res.body.db).toBeDefined();
      expect(res.body.redis).toBeDefined();
    });

    it('serves cached readiness within TTL', async () => {
      const first = await request(app).get('/ready');
      const second = await request(app).get('/ready');

      expect(second.body.checkedAt).toBe(first.body.checkedAt);
    });
  });

  describe('GET /live', () => {
    it('returns liveness probe data', async () => {
      const res = await request(app).get('/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('live');
      expect(res.body.memory).toBeDefined();
    });
  });

  describe('GET /api/docs.json', () => {
    it('returns swagger spec', async () => {
      const res = await request(app).get('/api/docs.json');

      expect(res.status).toBe(200);
      expect(res.body.openapi || res.body.swagger).toBeDefined();
    });
  });

  describe('GET /metrics', () => {
    it('returns Prometheus exposition format', async () => {
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toMatch(/http_requests_total/);
    });

    it('is not subject to the API rate limiter (mirrors /health, /ready, /live)', async () => {
      // globalRateLimit is scoped to '/api' only in app.ts — /metrics is
      // registered before that, alongside the other probe endpoints.
      // A handful of rapid requests should all succeed; this isn't an
      // exhaustive rate-limit-bypass test (that lives in
      // rateLimit.middleware.test.ts), just confirms /metrics wasn't
      // accidentally mounted under /api.
      const results = await Promise.all(
        Array.from({ length: 5 }, () => request(app).get('/metrics')),
      );
      results.forEach((res) => expect(res.status).toBe(200));
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/api/v1/unknown-route-xyz');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Route not found');
    });
  });
});
