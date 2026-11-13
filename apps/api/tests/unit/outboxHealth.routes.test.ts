import express from 'express';
import request from 'supertest';

/**
 * GET /health/outbox — deployment probe for the separate transactional-outbox worker.
 * The worker is its own process; this route proves it is draining events by looking at their age.
 * Module state (10s response cache) lives in the route module, so each test loads a fresh copy.
 */
const NOW = new Date('2026-11-13T12:00:00.000Z').getTime();

function buildApp(prismaMock: Record<string, jest.Mock>) {
  jest.doMock('../../src/config/prisma', () => ({ prisma: { outboxEvent: prismaMock } }));
  jest.doMock('../../src/shared/observability/healthCache', () => ({ getCachedReadiness: jest.fn() }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { healthRouter } = require('../../src/bootstrap/health.routes');
  const app = express();
  app.use(healthRouter);
  return app;
}

function mocks(overrides: Partial<{ pending: number; oldest: Date | null; dead: number; last: Date | null }> = {}) {
  const { pending = 0, oldest = null, dead = 0, last = null } = overrides;
  return {
    count: jest.fn().mockImplementation(({ where }: { where: { deadLetterAt?: unknown } }) =>
      Promise.resolve(where.deadLetterAt && typeof where.deadLetterAt === 'object' ? dead : pending)),
    findFirst: jest.fn().mockImplementation(({ where }: { where: { availableAt?: unknown; processedAt?: unknown } }) =>
      Promise.resolve(where.availableAt ? (oldest ? { availableAt: oldest } : null) : last ? { processedAt: last } : null)),
  };
}

describe('GET /health/outbox', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    delete process.env.OUTBOX_HEALTH_TOKEN;
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.dontMock('../../src/config/prisma');
    jest.dontMock('../../src/shared/observability/healthCache');
    delete process.env.OUTBOX_HEALTH_TOKEN;
  });

  it('reports ok when the queue is empty', async () => {
    const res = await request(buildApp(mocks())).get('/health/outbox');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', pending: 0, deadLetters: 0, oldestDueAgeSeconds: 0 });
  });

  it('stays ok while events are being drained quickly', async () => {
    const res = await request(buildApp(mocks({ pending: 3, oldest: new Date(NOW - 20_000), last: new Date(NOW - 1_000) }))).get('/health/outbox');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.pending).toBe(3);
    expect(res.body.oldestDueAgeSeconds).toBe(20);
  });

  it('returns 503 degraded with a worker hint when an event is overdue by more than 5 minutes', async () => {
    const res = await request(buildApp(mocks({ pending: 12, oldest: new Date(NOW - 10 * 60_000) }))).get('/health/outbox');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.hint).toMatch(/worker/i);
  });

  it('only counts events the worker could claim: unlocked or with an expired lease (live-lease slow events are not overdue)', async () => {
    const m = mocks({ pending: 1, oldest: null });
    const res = await request(buildApp(m)).get('/health/outbox');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    const dueCall = m.findFirst.mock.calls.map(([arg]) => arg).find((arg: { where: { availableAt?: unknown } }) => arg.where.availableAt);
    expect(dueCall.where.OR).toEqual([{ lockedAt: null }, { lockedAt: { lt: new Date(NOW - 120_000) } }]);
    expect(dueCall.where.processedAt).toBeNull();
    expect(dueCall.where.deadLetterAt).toBeNull();
  });

  it('returns 503 degraded when dead-lettered events exist', async () => {
    const res = await request(buildApp(mocks({ dead: 2 }))).get('/health/outbox');
    expect(res.status).toBe(503);
    expect(res.body.deadLetters).toBe(2);
    expect(res.body.hint).toMatch(/dead/i);
  });

  it('does not expose payloads or user identifiers', async () => {
    const res = await request(buildApp(mocks({ pending: 1, oldest: new Date(NOW - 1_000) }))).get('/health/outbox');
    expect(Object.keys(res.body).sort()).toEqual(
      ['deadLetters', 'lastProcessedAt', 'oldestDueAgeSeconds', 'pending', 'staleAfterSeconds', 'status'].sort(),
    );
  });

  it('requires x-health-token only when OUTBOX_HEALTH_TOKEN is configured', async () => {
    process.env.OUTBOX_HEALTH_TOKEN = 'secret-token';
    const app = buildApp(mocks());
    expect((await request(app).get('/health/outbox')).status).toBe(401);
    expect((await request(app).get('/health/outbox').set('x-health-token', 'wrong')).status).toBe(401);
    expect((await request(app).get('/health/outbox').set('x-health-token', 'secret-token')).status).toBe(200);
  });

  it('serves repeated probes from a short cache instead of querying the database each time', async () => {
    const m = mocks();
    const app = buildApp(m);
    await request(app).get('/health/outbox');
    await request(app).get('/health/outbox');
    expect(m.count).toHaveBeenCalledTimes(2); // pending + dead-letter, once
  });

  it('cached responses carry the CURRENT request id, not the first caller\'s', async () => {
    const m = mocks();
    jest.doMock('../../src/config/prisma', () => ({ prisma: { outboxEvent: m } }));
    jest.doMock('../../src/shared/observability/healthCache', () => ({ getCachedReadiness: jest.fn() }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { healthRouter } = require('../../src/bootstrap/health.routes');
    const app = express();
    app.use((req: express.Request & { requestId?: string }, _res: express.Response, next: express.NextFunction) => { req.requestId = String(req.header('x-test-id')); next(); });
    app.use(healthRouter);
    const first = await request(app).get('/health/outbox').set('x-test-id', 'req-1');
    const second = await request(app).get('/health/outbox').set('x-test-id', 'req-2');
    expect(first.body.requestId).toBe('req-1');
    expect(second.body.requestId).toBe('req-2');
    expect(m.count).toHaveBeenCalledTimes(2); // second came from the cache
  });

  it('returns 503 unknown when the database query fails', async () => {
    const m = mocks();
    m.count.mockRejectedValue(new Error('db down'));
    const res = await request(buildApp(m)).get('/health/outbox');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unknown');
  });
});
