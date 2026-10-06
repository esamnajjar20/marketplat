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
    // added a second production-only requirement
    // (CLOUDINARY_*) to the same superRefine block. Keep these present
    // here too so the REDIS_PASSWORD-only cases below aren't broken by
    // an unrelated Cloudinary failure — the dedicated Cloudinary
    // describe block further down deletes these itself per-test.
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud-name';
    process.env.CLOUDINARY_API_KEY = 'test-api-key';
    process.env.CLOUDINARY_API_SECRET = 'test-api-secret';

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

    // Under Jest, env.ts throws (instead of process.exit) so a single
    // misconfigured re-import does not kill the rest of the suite.
    // Outside test runners it still process.exit(1).
    await expect(import('../../src/config/env')).rejects.toThrow(
      /Invalid environment variables.*REDIS_PASSWORD/,
    );
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

/**
 * coverage: config/env.ts left CLOUDINARY_* optional
 * at every NODE_ENV, same as the SMTP_* and GOOGLE_CLIENT_* settings (all genuinely
 * optional integrations) — but .env.example's own comment on this
 * block says "Cloudinary (required for image uploads)" while nothing
 * enforced that in production. Combined with the disabled zero-image
 * check in ads.controller.ts (TRACK-IMG-HOSTING), a production deploy
 * with these unset previously started cleanly and silently accepted
 * ads/products/service-listings with zero images and no working
 * upload path. This confirms the new superRefine rule actually fails
 * startup when any of the three is missing in production, and that
 * dev/test remain unaffected.
 */
describe('config/env — CLOUDINARY_* production requirement', () => {
  const ORIGINAL_ENV = { ...process.env };
  let exitSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    // Unrelated production requirement in the same superRefine block —
    // keep it satisfied so only CLOUDINARY_* varies per test below.
    process.env.REDIS_PASSWORD = 'a-real-redis-password';

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

  it('fails startup when NODE_ENV=production and CLOUDINARY_CLOUD_NAME is unset', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CLOUDINARY_CLOUD_NAME;
    process.env.CLOUDINARY_API_KEY = 'test-api-key';
    process.env.CLOUDINARY_API_SECRET = 'test-api-secret';
    jest.resetModules();

    await expect(import('../../src/config/env')).rejects.toThrow(
      /Invalid environment variables.*CLOUDINARY_CLOUD_NAME/,
    );
  });

  it('fails startup when NODE_ENV=production and only some CLOUDINARY_* vars are set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud-name';
    delete process.env.CLOUDINARY_API_KEY;
    process.env.CLOUDINARY_API_SECRET = 'test-api-secret';
    jest.resetModules();

    await expect(import('../../src/config/env')).rejects.toThrow(
      /Invalid environment variables.*CLOUDINARY_CLOUD_NAME/,
    );
  });

  it('starts normally when NODE_ENV=production and all three CLOUDINARY_* vars are set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud-name';
    process.env.CLOUDINARY_API_KEY = 'test-api-key';
    process.env.CLOUDINARY_API_SECRET = 'test-api-secret';
    jest.resetModules();

    const { env } = await import('../../src/config/env');
    expect(env.cloudinary.cloudName).toBe('test-cloud-name');
  });

  it('starts normally in development with no CLOUDINARY_* vars set (local/no-upload workflow still allowed)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    jest.resetModules();

    const { env } = await import('../../src/config/env');
    expect(env.cloudinary.cloudName).toBeFalsy();
  });

  it('starts normally in test with no CLOUDINARY_* vars set (local/no-upload workflow still allowed)', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    jest.resetModules();

    const { env } = await import('../../src/config/env');
    expect(env.cloudinary.cloudName).toBeFalsy();
  });
});
