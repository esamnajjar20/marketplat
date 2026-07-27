import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser, createTestAdmin } from '../helpers/auth.helper';

describe('Auth Security', () => {

  /**
   * PROD-FIX-15: refreshToken now lives exclusively in an httpOnly
   * cookie — request(app) alone does not persist cookies between
   * separate calls, so every test in this describe uses
   * request.agent(app) instead (behaves like a real browser session,
   * carrying Set-Cookie responses forward automatically), matching
   * the pattern in tests/integration/auth.test.ts's own
   * "httpOnly cookie flow" describe.
   */
  describe('Token refresh rotation', () => {
    it('refreshes token and returns a new access token, rotating the refreshToken cookie', async () => {
      const agent = request.agent(app);
      // Register to get the initial refreshToken cookie
      const email = `refresh-test-${Date.now()}@test.com`;
      const registerRes = await agent
        .post('/api/v1/auth/register')
        .send({ name: 'Refresh User', email, password: 'password123', city: 'الرياض' });

      expect(registerRes.status).toBe(201);
      const registerCookies = registerRes.headers['set-cookie'] as unknown as string[];
      const originalRefreshCookie = registerCookies.find((c) => c.startsWith('refreshToken='));
      expect(originalRefreshCookie).toBeDefined();
      const csrfToken = registerRes.body.data.csrfToken as string;

      const refreshRes = await agent
        .post('/api/v1/auth/refresh')
        .set('X-CSRF-Token', csrfToken)
        .send();

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.tokens.accessToken).toBeDefined();
      // refreshToken must never appear in the response body — see
      // authCookies.ts / auth.controller.ts's respondWithSession.
      expect(refreshRes.body.data.tokens.refreshToken).toBeUndefined();

      // New refresh token cookie must be different from the old one (rotation).
      const refreshCookies = refreshRes.headers['set-cookie'] as unknown as string[];
      const rotatedRefreshCookie = refreshCookies.find((c) => c.startsWith('refreshToken='));
      expect(rotatedRefreshCookie).toBeDefined();
      expect(rotatedRefreshCookie).not.toBe(originalRefreshCookie);
    });

    it('rejects reuse of a rotated refresh token cookie', async () => {
      const agent = request.agent(app);
      const email = `reuse-test-${Date.now()}@test.com`;
      await agent
        .post('/api/v1/auth/register')
        .send({ name: 'Reuse User', email, password: 'password123', city: 'الرياض' });

      // Rotate once via the agent — its cookie jar now holds the NEW
      // refreshToken cookie; the original one it registered with is
      // no longer what the agent would send on a subsequent request,
      // but the backend has also invalidated that original token
      // server-side (reuse detection) — reconstruct a request that
      // deliberately sends the STALE (pre-rotation) cookie value to
      // simulate an attacker who captured it before rotation.
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Reuse User 2', email: `reuse2-${Date.now()}@test.com`, password: 'password123', city: 'الرياض' });
      const cookies = registerRes.headers['set-cookie'] as unknown as string[];
      const staleRefreshCookie = cookies.find((c) => c.startsWith('refreshToken='))!.split(';')[0];

      // First use — succeeds, rotates the token server-side.
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', staleRefreshCookie)
        .send()
        .expect(200);

      // Reuse the SAME stale cookie value again — must be rejected,
      // since it was already rotated/invalidated by the call above.
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', staleRefreshCookie)
        .send();

      expect(reuseRes.status).toBe(401);
    });

    it('rejects an invalid refreshToken cookie value', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refreshToken=completely-invalid-token')
        .send();

      expect(res.status).toBe(401);
    });

    it('rejects a refresh attempt with no refreshToken cookie at all', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send();
      expect(res.status).toBe(401);
    });
  });

  describe('Logout invalidates access token', () => {
    it('cannot use access token after logout', async () => {
      const email = `logout-test-${Date.now()}@test.com`;
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Logout User', email, password: 'password123', city: 'الرياض' });

      const { accessToken } = registerRes.body.data.tokens;

      // Confirm token works before logout
      const beforeLogout = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(beforeLogout.status).toBe(200);

      // Logout
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Same token must now be rejected
      const afterLogout = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(afterLogout.status).toBe(401);
    });
  });
});

describe('Role-based Authorization', () => {

  describe('Admin endpoints reject regular users', () => {
    it('GET /api/v1/admin/ads returns 403 for USER role', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .get('/api/v1/admin/ads')
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/v1/admin/users returns 403 for USER role', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/v1/admin/ads returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/admin/ads');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/admin/ads returns 200 for ADMIN role', async () => {
      const admin = await createTestAdmin();
      const res = await request(app)
        .get('/api/v1/admin/ads')
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Reports admin endpoints reject regular users', () => {
    it('GET /api/v1/reports returns 403 for USER role', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .get('/api/v1/reports')
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/v1/reports/:id/status returns 403 for USER role', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .patch('/api/v1/reports/fake-id/status')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ status: 'RESOLVED' });
      expect(res.status).toBe(403);
    });
  });
});

/**
 * PROD-FIX-15 regression guard, complementing auth.test.ts's
 * "/auth/login stays CSRF-exempt" test — that test proves the
 * EXEMPTION path resolves req.path correctly; this proves the
 * OPPOSITE direction: a real, non-exempt, state-changing route
 * (POST /api/v1/ads) is genuinely protected against a real Express
 * app + router.use(csrfProtection) composition, not just in the
 * mocked-Request unit tests (tests/unit/csrf.middleware.test.ts),
 * which assert on the middleware function's logic in isolation but
 * cannot prove Express computes req.path the way that logic assumes.
 *
 * createTestUser() (auth.helper.ts) signs a JWT directly and never
 * goes through /auth/register, so it never receives a csrfToken
 * cookie — deliberately NOT used here, since a request with no
 * csrfToken cookie at all is exempt from this check by design (see
 * csrf.middleware.ts's own "pure Bearer-token client" scoping
 * comment) and would not actually exercise the code path this test
 * needs to prove.
 */
describe('CSRF protection on a real, non-exempt route (regression guard)', () => {
  it('rejects POST /api/v1/ads with 403 when a csrfToken cookie exists but no X-CSRF-Token header is sent', async () => {
    const agent = request.agent(app);
    const user = {
      name: 'CSRF Test User',
      email: `csrf-ads-${Date.now()}@test.com`,
      password: 'TestPassword123!',
      city: 'غزة',
    };
    const registerRes = await agent.post('/api/v1/auth/register').send(user).expect(201);
    const accessToken = registerRes.body.data.tokens.accessToken as string;
    // agent's cookie jar now holds a real csrfToken cookie from registration.

    // Deliberately using `agent` (carries the csrfToken cookie
    // forward) with NO X-CSRF-Token header set — this is exactly the
    // gap CSRF protection exists to close: a cookie the browser would
    // send automatically, with no matching header a cross-site
    // attacker could not have set.
    const res = await agent
      .post('/api/v1/ads')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Should be rejected before validation', description: 'x', categoryId: 'x', city: 'غزة', price: 1 });

    expect(res.status).toBe(403);
  });

  it('allows POST /api/v1/ads through CSRF protection when a matching X-CSRF-Token header is sent (rejected later only by validation, not CSRF)', async () => {
    const agent = request.agent(app);
    const user = {
      name: 'CSRF Test User 2',
      email: `csrf-ads-2-${Date.now()}@test.com`,
      password: 'TestPassword123!',
      city: 'غزة',
    };
    const registerRes = await agent.post('/api/v1/auth/register').send(user).expect(201);
    const accessToken = registerRes.body.data.tokens.accessToken as string;
    const csrfToken = registerRes.body.data.csrfToken as string;
    expect(csrfToken).toBeDefined();

    const res = await agent
      .post('/api/v1/ads')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-CSRF-Token', csrfToken)
      // Deliberately minimal/incomplete body — this request should
      // fail validation (400), NOT CSRF protection (403). A 403 here
      // would mean the CSRF check itself is still wrongly rejecting
      // a request that correctly echoed the token.
      .send({});

    expect(res.status).not.toBe(403);
  });
});
