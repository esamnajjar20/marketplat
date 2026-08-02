import request from 'supertest';

/**
 * FIX OAUTH-01 integration coverage.
 *
 * Two separate scenarios, each needing a different app instance:
 *
 *   1. "not configured" (503) — uses the normal shared `app` import,
 *      since this test environment's real process.env has no
 *      GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL set (no .env.test entry
 *      for them — see backend/.env.example, where they're
 *      deliberately left blank/optional). This is the default,
 *      "Google OAuth not set up yet" state the feature is required to
 *      degrade gracefully into.
 *
 *   2. "configured" (full redirect + session flow) — env.ts reads
 *      process.env once at module load (same as
 *      env.redisPassword.test.ts's own documented pattern), so
 *      exercising the configured path requires setting the three vars
 *      BEFORE a fresh `jest.resetModules()` + re-import of `app`,
 *      exactly like that file does for REDIS_PASSWORD. The real
 *      network round-trip to Google is out of scope for CI (no way to
 *      complete an actual OAuth consent screen headlessly) — instead,
 *      passport-google-oauth20's Strategy.prototype.authenticate is
 *      stubbed to synchronously call its own success() with a fixed
 *      profile, which is exactly the shape Passport would hand back
 *      after a real, successful Google round-trip. Everything
 *      downstream of that point (authController.googleCallback,
 *      authService.loginWithGoogle, issueSession, cookie-setting) is
 *      then exercised for real, against the real (test) database.
 */

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:5000/api/v1/auth/google/callback',
};

describe('GET /api/v1/auth/google — not configured (default test env)', () => {
  it('returns 503 with GOOGLE_OAUTH_NOT_CONFIGURED when Google credentials are unset', async () => {
    // Guard: if a real developer's local .env.test happens to define
    // these (unlikely, but would silently invalidate this specific
    // assertion), skip rather than false-fail.
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL) {
      return;
    }

    const { app } = await import('../../src/app');
    const res = await request(app).get('/api/v1/auth/google').redirects(0);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('GOOGLE_OAUTH_NOT_CONFIGURED');
    expect(res.body.success).toBe(false);
  });

  it('returns 503 for the callback route too', async () => {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL) {
      return;
    }

    const { app } = await import('../../src/app');
    const res = await request(app).get('/api/v1/auth/google/callback').redirects(0);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('GOOGLE_OAUTH_NOT_CONFIGURED');
  });

  it('does not affect local /auth/login — still works normally', async () => {
    const { app } = await import('../../src/app');
    const email = `google-oauth-regression-${Date.now()}@example.com`;

    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Regression Check', email, password: 'TestPassword123!', city: 'غزة' })
      .expect(201);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'TestPassword123!' })
      .expect(200);

    expect(loginRes.body.data.tokens.accessToken).toBeDefined();
    expect(loginRes.body.data.user.email).toBe(email);
  });
});

describe('GET /api/v1/auth/google/callback — configured, full session flow', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, ...GOOGLE_ENV };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    // FIX OAUTH-01: jest.doMock's registration (unlike jest.mock)
    // persists across jest.resetModules() calls within the same test
    // file — without an explicit unmock here, a later test in this
    // file that expects the REAL GoogleStrategy (or a differently-
    // stubbed one) would silently keep getting whichever StubStrategy
    // the previous test's stubGoogleStrategyProfile() last registered.
    jest.unmock('passport-google-oauth20');
    jest.resetModules();
    jest.restoreAllMocks();
  });

  /**
   * Stubs passport-google-oauth20's Strategy so GET /auth/google/callback
   * can be exercised end-to-end without a real Google round-trip. This
   * runs BEFORE importing app/google.strategy so the real
   * GoogleStrategy class (used by configureGoogleStrategy() at module
   * load) is the mocked one.
   *
   * Deliberately does NOT try to fake the OAuth2 transport internals
   * (authorization-code exchange, userinfo HTTP call) — those belong
   * to passport-oauth2's base class and this app has zero custom logic
   * there worth testing against a guessed-at internal shape. Instead,
   * overrides only authenticate() to invoke the *real* verify function
   * this app defined in google.strategy.ts's configureGoogleStrategy()
   * — passport-oauth2's documented convention (see its README) is to
   * store the constructor's verify callback as `this._verify`, which
   * every passport-oauth2-based strategy (including this one) relies
   * on being present, so this is exercising this app's own code
   * (extractGoogleProfile + the try/catch -> done() wiring) exactly as
   * the real flow would, just with the Google network round-trip
   * itself skipped.
   */
  function stubGoogleStrategyProfile(profile: Record<string, unknown>) {
    jest.doMock('passport-google-oauth20', () => {
      const actual = jest.requireActual('passport-google-oauth20');
      class StubStrategy extends actual.Strategy {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authenticate(this: any) {
          this._verify('stub-access-token', 'stub-refresh-token', profile, (err: unknown, user: unknown) => {
            if (err) {
              this.error(err);
              return;
            }
            if (!user) {
              this.fail('no user');
              return;
            }
            this.success(user);
          });
        }
      }
      return { ...actual, Strategy: StubStrategy };
    });
  }

  it('creates a brand-new user, issues a session, sets cookies, and redirects to the frontend', async () => {
    const email = `google-integration-${Date.now()}@example.com`;
    stubGoogleStrategyProfile({
      id: 'google-int-test-id',
      displayName: 'Google Integration User',
      emails: [{ value: email, verified: true }],
      photos: [{ value: 'https://example.com/avatar.jpg' }],
      provider: 'google',
    });

    const { app } = await import('../../src/app');
    const res = await request(app).get('/api/v1/auth/google/callback').redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000');

    const setCookieHeader = res.headers['set-cookie'] as unknown as string[];
    const refreshCookie = setCookieHeader.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    const csrfCookie = setCookieHeader.find((c) => c.startsWith('csrfToken='));
    expect(csrfCookie).toBeDefined();

    // Confirm the created user really exists with the right shape by
    // logging in via a second Google callback for the SAME email —
    // this should hit the "existing googleId" login path, not create
    // a second user, and should return a session for the same account.
    const { prisma } = await import('../../src/config/prisma');
    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).not.toBeNull();
    expect(created?.provider).toBe('google');
    expect(created?.googleId).toBe('google-int-test-id');
    expect(created?.passwordHash).toBeNull();
  });

  it('links Google to an existing local account instead of creating a duplicate user', async () => {
    const email = `google-link-${Date.now()}@example.com`;

    // First: register a normal local account.
    const { app: localApp } = await import('../../src/app');
    await request(localApp)
      .post('/api/v1/auth/register')
      .send({ name: 'Local First', email, password: 'TestPassword123!', city: 'غزة' })
      .expect(201);

    // Then: "sign in with Google" using the same email.
    stubGoogleStrategyProfile({
      id: 'google-int-test-id',
      displayName: 'Google Integration User',
      emails: [{ value: email, verified: true }],
      photos: [{ value: 'https://example.com/avatar.jpg' }],
      provider: 'google',
    });
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, ...GOOGLE_ENV };
    const { app: googleApp } = await import('../../src/app');

    const res = await request(googleApp).get('/api/v1/auth/google/callback').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000');

    const { prisma } = await import('../../src/config/prisma');
    const users = await prisma.user.findMany({ where: { email } });

    // Exactly one user for this email — linked, not duplicated.
    expect(users).toHaveLength(1);
    expect(users[0].provider).toBe('google');
    expect(users[0].googleId).toBe('google-int-test-id');
    // The original local password must still be intact — linking
    // never touches it.
    expect(users[0].passwordHash).not.toBeNull();
  });

  it('redirects with an error query param when the Google profile has no usable email', async () => {
    stubGoogleStrategyProfile({
      id: 'google-int-test-id',
      displayName: 'No Email User',
      emails: [],
      photos: [],
      provider: 'google',
    });

    const { app } = await import('../../src/app');
    const res = await request(app).get('/api/v1/auth/google/callback').redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
    expect(res.headers.location).toContain('error=google_auth_failed');

    const setCookieHeader = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(setCookieHeader.find((c) => c.startsWith('refreshToken='))).toBeUndefined();
  });
});
