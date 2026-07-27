import request from 'supertest';
import { app } from '../../src/app';

// T-04: No shared mutable state between describes.
// Each describe creates its own user via HTTP registration.
// Using a factory to guarantee a unique email per test run AND per worker.
const makeUser = () => ({
  name: 'Integration Test User',
  email: `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
  password: 'TestPassword123!',
  city: 'رام الله',
});

describe('POST /api/v1/auth/register', () => {
  it('registers a new user and returns an access token (refreshToken moved to an httpOnly cookie)', async () => {
    const user = makeUser();
    const res = await request(app).post('/api/v1/auth/register').send(user).expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    // PROD-FIX-15: refreshToken must NEVER appear in the JSON body —
    // it's set exclusively as an httpOnly cookie now (see
    // shared/utils/authCookies.ts / auth.controller.ts's
    // respondWithSession). This is a security-relevant assertion, not
    // just a shape check: if this ever starts passing again, the
    // secret is leaking back into JS-readable response data.
    expect(res.body.data.tokens.refreshToken).toBeUndefined();
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.csrfToken).toBeDefined();

    // Confirm the cookie itself IS set, with the expected security attributes.
    const setCookieHeader = res.headers['set-cookie'] as unknown as string[];
    const refreshCookie = setCookieHeader.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Lax');
    expect(refreshCookie).toContain('Path=/api/v1/auth');

    const csrfCookie = setCookieHeader.find((c) => c.startsWith('csrfToken='));
    expect(csrfCookie).toBeDefined();
    // csrfToken must NOT be HttpOnly — client JS needs to read it to
    // echo it back in the X-CSRF-Token header (see csrf.middleware.ts).
    expect(csrfCookie).not.toContain('HttpOnly');

    // AUDIT-FIX C-1: app_has_session must also be set — non-HttpOnly
    // (middleware.ts's Edge runtime and client JS both need to read
    // it), scoped site-wide, with a lifetime matching refreshToken's.
    const sessionHintCookie = setCookieHeader.find((c) => c.startsWith('app_has_session='));
    expect(sessionHintCookie).toBeDefined();
    expect(sessionHintCookie).not.toContain('HttpOnly');
    expect(sessionHintCookie).toContain('Path=/');
  });

  it('rejects duplicate email with 400', async () => {
    const user = makeUser();
    await request(app).post('/api/v1/auth/register').send(user).expect(201);
    const res = await request(app).post('/api/v1/auth/register').send(user).expect(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects invalid email format with 400', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ ...makeUser(), email: 'not-an-email' })
      .expect(400);
  });

  it('rejects password shorter than 8 chars with 400', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ ...makeUser(), password: '123' })
      .expect(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  // T-04: this describe registers its own independent user
  let registeredEmail: string;
  const password = 'TestPassword123!';

  beforeEach(async () => {
    const user = makeUser();
    registeredEmail = user.email;
    await request(app)
      .post('/api/v1/auth/register')
      .send({ ...user, password })
      .expect(201);
  });

  it('returns tokens on valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: registeredEmail, password })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
  });

  it('returns 401 for wrong password', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: registeredEmail, password: 'wrong-password' })
      .expect(401);
  });

  it('returns 401 for non-existent email', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password })
      .expect(401);
  });

  /**
   * PROD-FIX-15 / regression guard: csrfProtection is registered via
   * `router.use(csrfProtection)` in routes.ts (mounted at /api/v1 in
   * app.ts), and its CSRF_EXEMPT_PATHS set checks req.path against
   * bare values like '/auth/login' — NOT '/api/v1/auth/login'. This
   * relies on Express computing req.path as relative to the router's
   * own mount point when the middleware is registered directly on
   * that router (not on `app`). Every other register/login test above
   * happens to pass regardless of whether that assumption is correct,
   * because a brand-new user/session has no csrfToken cookie yet —
   * the middleware's OTHER exemption ("no csrfToken cookie present at
   * all -> skip") would let the request through either way, silently
   * masking a wrong req.path computation.
   *
   * This test closes that gap: an agent that already holds a
   * csrfToken cookie (from a prior register call) attempts a SECOND,
   * unrelated login with NO X-CSRF-Token header and a cookie that, if
   * checked, would fail to match (there's no header at all to match
   * against). If csrfProtection's exemption path lookup were broken
   * (e.g. matching against '/api/v1/auth/login' instead of
   * '/auth/login', finding no match, and falling through to the
   * "cookie present but no header" rejection branch), this would fail
   * with 403 instead of reaching the real 401 (wrong password) the
   * login logic itself produces.
   */
  it('REGRESSION: /auth/login stays CSRF-exempt in the real Express router even when a csrfToken cookie already exists from a prior session', async () => {
    const agent = request.agent(app);
    const firstUser = makeUser();
    await agent.post('/api/v1/auth/register').send(firstUser).expect(201);
    // agent's cookie jar now holds a real csrfToken cookie.

    // Attempt a login with different (intentionally wrong) credentials,
    // deliberately sending NO X-CSRF-Token header. If the exemption
    // path match were broken, csrfProtection would reject this with
    // 403 before the request ever reached authController.login. Since
    // the exemption works correctly, the request reaches the real
    // login logic, which itself rejects wrong credentials with 401 —
    // a 401 (not 403) is the actual proof this test is checking for.
    const res = await agent
      .post('/api/v1/auth/login')
      .send({ email: firstUser.email, password: 'definitely-wrong-password' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  // T-04: independent user — not dependent on any other describe
  let accessToken: string;

  beforeEach(async () => {
    const user = makeUser();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(user)
      .expect(201);
    accessToken = res.body.data.tokens.accessToken;
  });

  it('logs out and invalidates the token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 when no token provided', async () => {
    await request(app).post('/api/v1/auth/logout').expect(401);
  });
});

/**
 * PROD-FIX-15: /auth/refresh now reads the refresh token exclusively
 * from an httpOnly cookie — request(app) alone (used everywhere else
 * in this file) does NOT persist cookies between separate calls, so
 * these tests specifically need request.agent(app), which behaves
 * like a real browser session and carries Set-Cookie responses
 * forward into subsequent requests automatically. This is also why
 * these tests live in their own describe block rather than reusing
 * the plain `request(app)` calls above.
 */
describe('POST /api/v1/auth/refresh (httpOnly cookie flow)', () => {
  it('refreshes using the httpOnly cookie set at registration, with no request body', async () => {
    const agent = request.agent(app);
    const user = makeUser();
    const registerRes = await agent.post('/api/v1/auth/register').send(user).expect(201);
    const csrfToken = registerRes.body.data.csrfToken as string;

    const res = await agent
      .post('/api/v1/auth/refresh')
      .set('X-CSRF-Token', csrfToken)
      .send()
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeUndefined();
  });

  it('rotates the refreshToken cookie on every successful refresh', async () => {
    const agent = request.agent(app);
    const user = makeUser();
    const registerRes = await agent.post('/api/v1/auth/register').send(user).expect(201);
    const registerCookies = registerRes.headers['set-cookie'] as unknown as string[];
    const originalRefreshCookie = registerCookies.find((c) => c.startsWith('refreshToken='));
    const csrfToken = registerRes.body.data.csrfToken as string;

    const refreshRes = await agent
      .post('/api/v1/auth/refresh')
      .set('X-CSRF-Token', csrfToken)
      .send()
      .expect(200);
    const refreshCookies = refreshRes.headers['set-cookie'] as unknown as string[];
    const rotatedRefreshCookie = refreshCookies.find((c) => c.startsWith('refreshToken='));

    expect(rotatedRefreshCookie).toBeDefined();
    expect(rotatedRefreshCookie).not.toBe(originalRefreshCookie);
  });

  it('returns 401 when no refreshToken cookie is present at all', async () => {
    // Plain request(app), deliberately not an agent — no cookies carried at all.
    const res = await request(app).post('/api/v1/auth/refresh').send().expect(401);
    expect(res.body.success).toBe(false);
  });

  it('ignores a refreshToken in the request body — cookie is the only source read', async () => {
    // Confirms the old body-based path is genuinely gone, not just
    // undocumented — sending a well-formed-looking body must not
    // substitute for a missing cookie.
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'some-token-that-is-not-a-real-cookie' })
      .expect(401);
    expect(res.body.success).toBe(false);
  });
});
