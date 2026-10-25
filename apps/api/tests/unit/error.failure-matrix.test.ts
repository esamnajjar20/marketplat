import express from 'express';
import request from 'supertest';
import { AppError } from '../../src/shared/errors/AppError';
import { errorMiddleware } from '../../src/middlewares/error.middleware';
import { requestIdMiddleware } from '../../src/middlewares/requestId.middleware';
import { register, httpErrorsTotal, metricsMiddleware } from '../../src/shared/utils/metrics';

describe('error handling failure matrix', () => {
  beforeEach(() => register.resetMetrics());

  function appFor(error: Error) {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(metricsMiddleware);
    app.get('/probe/:id', () => { throw error; });
    app.use(errorMiddleware);
    return app;
  }

  const cases: Array<[string, number, string]> = [
    ['bad request', 400, 'BAD_REQUEST'],
    ['unauthorized', 401, 'UNAUTHORIZED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['not found', 404, 'RESOURCE_NOT_FOUND'],
    ['conflict', 409, 'CONFLICT'],
    ['unprocessable', 422, 'UNPROCESSABLE_ENTITY'],
    ['rate limited', 429, 'RATE_LIMIT_EXCEEDED'],
    ['service unavailable', 503, 'SERVICE_UNAVAILABLE'],
    ['internal', 500, 'INTERNAL_ERROR'],
  ];

  it.each(cases)('normalizes %s into a stable response contract', async (_name, status, code) => {
    const error = new AppError('internal test message', status, code);
    const res = await request(appFor(error)).get('/probe/test-id');
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(status);
    expect(res.body.code).toBe(code);
    expect(typeof res.body.requestId).toBe('string');
    if (status >= 500) expect(res.body.message).not.toBe('internal test message');
  });

  it('records low-cardinality error metrics without the raw resource id', async () => {
    const res = await request(appFor(new AppError('nope', 429, 'RATE_LIMIT_EXCEEDED'))).get('/probe/secret-resource-id');
    expect(res.status).toBe(429);
    const metric = await httpErrorsTotal.get();
    const sample = metric.values.find(v => v.labels.error_code === 'RATE_LIMIT_EXCEEDED');
    expect(sample).toBeDefined();
    expect(sample?.labels.route).toBe('/probe/:id');
    expect(sample?.labels.route).not.toContain('secret-resource-id');
  });
});
