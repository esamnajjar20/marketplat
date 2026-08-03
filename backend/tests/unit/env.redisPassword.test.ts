/**
 * L-2 (audit fix) coverage: config/env.ts previously left
 * REDIS_PASSWORD optional at every NODE_ENV, with the "required in
 * production" rule enforced only in docker-compose.full.yml
 * (`${REDIS_PASSWORD:?...}`) — a process started any other way (e.g.
 * PM2 directly via ecosystem.config.js) could connect to Redis with no
 * password and no warning. This confirms the new superRefine actually
 * fails startup when NODE_ENV=production and REDIS_PASSWORD is unset,
 * and that dev/test are unaffected (a local unauthenticated Redis is a
 * normal setup there).
 *
 * env.ts reads process.env once at module-load time and calls
 * process.exit(1) synchronously on validation failure, so this follows
 * the same jest.resetModules() + dynamic re-import per test pattern as
 * authCookies.test.ts/metrics.test.ts's METRICS_TOKEN tests, plus a
 * spy on process.exit so a validation failure doesn't kill the test
 * worker.
 */

describe('config/env — REDIS_PASSWORD production requirement', () => {
  const ORIGINAL_ENV = { ...process.env };
  let exitSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    // env.ts requires these unconditionally regardless of REDIS_PASSWORD;
    // keep them present so only REDIS_PASSWORD varies per test.
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('process.exit called');
    }) as never);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    jest.resetModules();
  });

  it('fails startup when NODE_ENV=production and REDIS_PASSWORD is unset', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REDIS_PASSWORD;
    jest.resetModules();

    await expect(import('../../src/config/env')).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('starts normally when NODE_ENV=production and REDIS_PASSWORD is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_PASSWORD = 'a-real-redis-password';
    jest.resetModules();

    const { env } = await import('../../src/config/env');
    expect(env.redis.password).toBe('a-real-redis-password');
  });

  it('starts normally in development with no REDIS_PASSWORD (unauthenticated local Redis still allowed)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.REDIS_PASSWORD;
    jest.resetModules();

    const { env } = await import('../../src/config/env');
    // Falsy, not strictly undefined: a local .env/.env.test defining
    // REDIS_PASSWORD= (empty) makes dotenv.config() repopulate it as ''
    // on this fresh module import even after delete() above — env.ts's
    // own production check (!data.REDIS_PASSWORD) and any real Redis
    // client both treat '' and undefined identically as "no password",
    // so that's the behavior worth asserting here.
    expect(env.redis.password).toBeFalsy();
  });

  it('starts normally in test with no REDIS_PASSWORD (unauthenticated local Redis still allowed)', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_PASSWORD;
    jest.resetModules();

    const { env } = await import('../../src/config/env');
    expect(env.redis.password).toBeFalsy();
  });
});
