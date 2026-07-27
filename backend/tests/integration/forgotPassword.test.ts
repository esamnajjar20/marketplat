import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';
import { prisma } from '../../src/config/prisma';

describe('Forgot / Reset Password', () => {
  describe('POST /auth/forgot-password', () => {
    it('returns 200 for a registered email', async () => {
      const user = await createTestUser({ email: `fp-${Date.now()}@test.com` });

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 200 for an unregistered email too (no enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: `nobody-${Date.now()}@test.com` });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns the same response shape for existing vs non-existing emails', async () => {
      const user = await createTestUser({ email: `fp2-${Date.now()}@test.com` });

      const existingRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email });

      const missingRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: `still-nobody-${Date.now()}@test.com` });

      expect(existingRes.status).toBe(missingRes.status);
      expect(Object.keys(existingRes.body).sort()).toEqual(Object.keys(missingRes.body).sort());
    });

    it('rejects an invalid email format with 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('creates a password reset token row for a registered email', async () => {
      const user = await createTestUser({ email: `fp3-${Date.now()}@test.com` });

      await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });

      const tokenRow = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });
      expect(tokenRow).not.toBeNull();
      expect(tokenRow?.used).toBe(false);
      expect(tokenRow!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('does not create a token row for an unregistered email', async () => {
      const email = `truly-nobody-${Date.now()}@test.com`;
      await request(app).post('/api/v1/auth/forgot-password').send({ email });

      const count = await prisma.passwordResetToken.count();
      expect(count).toBe(0);
    });

    // NOTE: an "exceeds N requests -> 429" integration test is intentionally
    // NOT included here. The shared Redis mock (tests/setup.ts) hardcodes
    // EVALSHA to always return [1, ttl] regardless of call count, since
    // rate-limit-redis v4 drives its atomic increment through a Lua script
    // rather than plain INCR. Under that mock, express-rate-limit can never
    // observe more than 1 hit per key, so a "4th request is blocked" test
    // would pass even if the real rate limiter were completely broken —
    // it wouldn't be testing anything. No other rate limiter in this
    // codebase has threshold tests for the same reason. The check below
    // instead confirms the limiter is actually wired into the route (a
    // single request succeeds and carries the standard rate-limit headers),
    // which is the part that's meaningfully testable without a real Redis.
    it('applies rate-limit headers to the forgot-password route', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: `headers-${Date.now()}@test.com` });

      expect(res.status).toBe(200);
      // express-rate-limit's standardHeaders:true adds these on every response.
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
    });
  });

  describe('POST /auth/reset-password', () => {
    async function requestResetToken(email: string): Promise<string> {
      await request(app).post('/api/v1/auth/forgot-password').send({ email });
      const row = await prisma.passwordResetToken.findFirst({
        where: { user: { email } },
        orderBy: { createdAt: 'desc' },
      });
      if (!row) throw new Error('No reset token was created for test setup');
      return row.token;
    }

    it('resets the password with a valid token', async () => {
      const user = await createTestUser({ email: `rp-${Date.now()}@test.com` });
      const token = await requestResetToken(user.email);

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'brandNewPassword123' });

      expect(res.status).toBe(200);

      // The new password must actually work for login.
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'brandNewPassword123' });
      expect(loginRes.status).toBe(200);
    });

    it('invalidates the old password after reset', async () => {
      const user = await createTestUser({ email: `rp2-${Date.now()}@test.com` });
      const token = await requestResetToken(user.email);

      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'brandNewPassword123' });

      const oldLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'password123' }); // original test-helper password
      expect(oldLoginRes.status).toBe(401);
    });

    it('rejects an unknown token with 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'totally-made-up-token', newPassword: 'brandNewPassword123' });

      expect(res.status).toBe(400);
    });

    it('rejects reusing an already-consumed token', async () => {
      const user = await createTestUser({ email: `rp3-${Date.now()}@test.com` });
      const token = await requestResetToken(user.email);

      const first = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'firstNewPassword123' });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'secondNewPassword123' });
      expect(second.status).toBe(400);
    });

    it('rejects a password shorter than 8 characters', async () => {
      const user = await createTestUser({ email: `rp4-${Date.now()}@test.com` });
      const token = await requestResetToken(user.email);

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'short' });

      expect(res.status).toBe(400);
    });

    it('revokes all existing sessions after a successful reset', async () => {
      const email = `rp5-${Date.now()}@test.com`;
      await createTestUser({ email });

      // Use a real login round-trip via an agent (persists the
      // refreshToken cookie automatically, same as a real browser)
      // so the refresh token is genuinely persisted via
      // tokenStore.saveRefreshToken (createTestUser's synthetic token
      // is never saved, so testing against it would pass even if
      // revocation were broken — a false positive).
      //
      // PROD-FIX-15: refreshToken now lives in an httpOnly cookie —
      // request.agent(app) carries it forward automatically between
      // the login and refresh calls below, replacing the old
      // send({ refreshToken }) approach.
      const agent = request.agent(app);
      const loginRes = await agent
        .post('/api/v1/auth/login')
        .send({ email, password: 'password123' });
      const csrfToken = loginRes.body.data.csrfToken as string;

      const token = await requestResetToken(email);
      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'brandNewPassword123' });

      const refreshRes = await agent
        .post('/api/v1/auth/refresh')
        .set('X-CSRF-Token', csrfToken)
        .send();

      expect(refreshRes.status).toBe(401);
    });
  });
});
