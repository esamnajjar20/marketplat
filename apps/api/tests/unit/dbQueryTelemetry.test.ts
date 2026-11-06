import express from 'express';
import request from 'supertest';
import { register, metricsMiddleware } from '../../src/shared/utils/metrics';
import {
  createDatabaseRequestMetricsFinalizer,
  databaseRequestContextMiddleware,
  prismaQueriesPerHttpRequest,
  prismaQueryDurationSeconds,
  prismaRepeatedQueryGroupsTotal,
  prismaRepeatedQueryMaxPerHttpRequest,
  prismaSlowQueriesTotal,
  recordPrismaQuery,
} from '../../src/shared/utils/dbQueryTelemetry';

describe('database query telemetry', () => {
  beforeEach(() => {
    register.resetMetrics();
  });

  it('aggregates Prisma query count and duration by the matched HTTP route', async () => {
    const app = express();
    app.use(databaseRequestContextMiddleware);
    app.use(metricsMiddleware);
    app.get('/ads/:id', async (_req, res) => {
      await Promise.resolve();
      recordPrismaQuery('Ad', 'findUnique', { where: { id: 'private-ad-id-1' } }, 12);
      recordPrismaQuery('SellerProfile', 'findUnique', { where: { id: 'private-seller-id' } }, 8);
      res.status(200).json({ ok: true });
    });

    await request(app).get('/ads/private-ad-id-1');

    const count = await prismaQueriesPerHttpRequest.get();
    const countSample = count.values.find(
      value =>
        value.metricName === 'prisma_queries_per_http_request_count' &&
        value.labels.route === '/ads/:id' &&
        value.labels.status_code === '200'
    );
    expect(countSample?.value).toBe(1);

    const duration = await prismaQueryDurationSeconds.get();
    expect(duration.values.some(value => value.labels.model === 'Ad')).toBe(true);

    const requestHistogram = await prismaQueriesPerHttpRequest.get();
    const sumSample = requestHistogram.values.find(
      value =>
        value.metricName === 'prisma_queries_per_http_request_sum' &&
        value.labels.route === '/ads/:id'
    );
    expect(sumSample?.value).toBe(2);
  });

  it('flags repeated identical query shapes as heuristic N+1 candidates without storing values', async () => {
    const app = express();
    app.use(databaseRequestContextMiddleware);
    app.use(metricsMiddleware);
    app.get('/feed', (_req, res) => {
      for (let index = 0; index < 7; index += 1) {
        recordPrismaQuery(
          'SellerProfile',
          'findUnique',
          { where: { userId: `private-user-${index}` }, select: { id: true, averageRating: true } },
          4
        );
      }
      res.status(200).json({ ok: true });
    });

    await request(app).get('/feed');

    const repeated = await prismaRepeatedQueryGroupsTotal.get();
    const sample = repeated.values.find(
      value => value.labels.route === '/feed' && value.labels.model === 'SellerProfile'
    );
    expect(sample?.value).toBe(1);

    const maximum = await prismaRepeatedQueryMaxPerHttpRequest.get();
    const maxSample = maximum.values.find(
      value =>
        value.metricName === 'prisma_repeated_query_max_per_http_request_count' &&
        value.labels.route === '/feed'
    );
    expect(maxSample?.value).toBe(1);

    const exposition = await register.metrics();
    expect(exposition).not.toContain('private-user-');
  });

  it('does not classify repeated write operations as N+1 read candidates', async () => {
    const app = express();
    app.use(databaseRequestContextMiddleware);
    app.use(metricsMiddleware);
    app.post('/bulk-update', (_req, res) => {
      for (let index = 0; index < 7; index += 1) {
        recordPrismaQuery('Ad', 'update', { where: { id: `private-ad-${index}` }, data: { status: 'ACTIVE' } }, 3);
      }
      res.status(200).end();
    });

    await request(app).post('/bulk-update');

    const repeated = await prismaRepeatedQueryGroupsTotal.get();
    expect(repeated.values.find(value => value.labels.route === '/bulk-update')).toBeUndefined();

    const count = await prismaQueriesPerHttpRequest.get();
    const sumSample = count.values.find(
      value =>
        value.metricName === 'prisma_queries_per_http_request_sum' &&
        value.labels.route === '/bulk-update'
    );
    expect(sumSample?.value).toBe(7);
  });

  it('does not treat opaque raw SQL calls as repeated query-shape candidates', async () => {
    const app = express();
    app.use(databaseRequestContextMiddleware);
    app.use(metricsMiddleware);
    app.get('/raw-report', (_req, res) => {
      for (let index = 0; index < 7; index += 1) {
        recordPrismaQuery('$raw', '$queryRaw', [Object.assign(Object.create({ constructor: { name: 'Sql' } }), {})], 2);
      }
      res.status(200).json({ ok: true });
    });

    await request(app).get('/raw-report');

    const repeated = await prismaRepeatedQueryGroupsTotal.get();
    expect(repeated.values.find(value => value.labels.route === '/raw-report')).toBeUndefined();

    const count = await prismaQueriesPerHttpRequest.get();
    const sumSample = count.values.find(
      value =>
        value.metricName === 'prisma_queries_per_http_request_sum' &&
        value.labels.route === '/raw-report'
    );
    expect(sumSample?.value).toBe(7);
  });

  it('records slow operations and keeps query metric labels bounded to model/action', async () => {
    recordPrismaQuery('Ad', 'findMany', { where: { status: 'ACTIVE' } }, 275);

    const slow = await prismaSlowQueriesTotal.get();
    expect(slow.values.find(value => value.labels.model === 'Ad')?.value).toBe(1);

    const operations = await prismaQueryDurationSeconds.get();
    const sample = operations.values.find(value => value.labels.model === 'Ad');
    expect(sample?.labels).toEqual({ model: 'Ad', action: 'findMany' });
  });

  it('finalizes request metrics only once', async () => {
    const app = express();
    app.use(databaseRequestContextMiddleware);
    app.get('/once', (_req, res) => {
      recordPrismaQuery('Ad', 'findMany', { where: { status: 'ACTIVE' } }, 1);
      const finalize = createDatabaseRequestMetricsFinalizer();
      finalize({ method: 'GET', route: '/once', statusCode: 200 });
      finalize({ method: 'GET', route: '/once', statusCode: 200 });
      res.status(200).end();
    });

    await request(app).get('/once');

    const count = await prismaQueriesPerHttpRequest.get();
    const samples = count.values.filter(
      value =>
        value.metricName === 'prisma_queries_per_http_request_count' &&
        value.labels.route === '/once'
    );
    expect(samples).toHaveLength(1);
    expect(samples[0].value).toBe(1);
  });
});
