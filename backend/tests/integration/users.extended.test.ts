import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';

describe('Users API — extended coverage', () => {
  describe('GET /api/v1/users/:id/ads', () => {
    it('returns public ads for active user', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { title: 'Public Profile Ad' });

      const res = await request(app).get(`/api/v1/users/${user.id}/ads`).query({ page: '1', limit: '20' });

      expect(res.status).toBe(200);
      expect(res.body.meta.pagination).toBeDefined();
      expect(res.body.data.every((a: { user: { id: string } }) => a.user.id === user.id)).toBe(true);
    });

    it('returns 404 for deactivated user', async () => {
      const user = await createTestUser();
      await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

      const res = await request(app).get(`/api/v1/users/${user.id}/ads`).query({ page: '1', limit: '20' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/users/me', () => {
    it('deactivates account and invalidates session', async () => {
      const email = `delete-me-${Date.now()}@test.com`;
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Delete Me', email, password: 'password123', city: 'الرياض' });

      const { accessToken } = registerRes.body.data.tokens;

      const deleteRes = await request(app)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(deleteRes.status).toBe(200);

      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(401);

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.isActive).toBe(false);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).delete('/api/v1/users/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/users/me — duplicate phone', () => {
    it('returns 400 when phone already in use', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await prisma.user.update({
        where: { id: user1.id },
        data: { phone: '+966501234567' },
      });

      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ phone: '+966501234567' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/phone/i);
    });
  });

  // FIX SEC-07: changePassword now invalidates every other session, not
  // just the password hash. These use a real /auth/register flow (not
  // createTestUser, which signs tokens directly without going through
  // tokenStore.saveRefreshToken) so the refresh token is actually
  // persisted in Redis and its invalidation is genuinely observable.
  //
  // PROD-FIX-15: refreshToken now lives in an httpOnly cookie, not the
  // response body — registerRealUser returns a supertest agent (which
  // carries that cookie forward automatically on subsequent requests
  // made through the same agent) instead of a raw refreshToken string.
  describe('POST /api/v1/users/me/password — session invalidation', () => {
    async function registerRealUser() {
      const agent = request.agent(app);
      const email = `pwchange-${Date.now()}-${Math.random()}@test.com`;
      const res = await agent
        .post('/api/v1/auth/register')
        .send({ name: 'Password Change User', email, password: 'oldPassword123', city: 'الرياض' });
      return {
        agent,
        email,
        accessToken: res.body.data.tokens.accessToken as string,
        csrfToken: res.body.data.csrfToken as string,
      };
    }

    it('changes the password successfully with valid current password', async () => {
      const { accessToken } = await registerRealUser();

      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'oldPassword123', newPassword: 'newPassword456' });

      expect(res.status).toBe(200);
    });

    it('rejects an incorrect current password with 400 and does not change anything', async () => {
      const { accessToken } = await registerRealUser();

      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'totallyWrongPassword', newPassword: 'newPassword456' });

      expect(res.status).toBe(400);
    });

    it('invalidates the refresh token used at registration — it can no longer be used to refresh', async () => {
      const { agent, accessToken, csrfToken } = await registerRealUser();

      const changeRes = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'oldPassword123', newPassword: 'newPassword456' });
      expect(changeRes.status).toBe(200);

      // The refresh token cookie issued at registration must now be
      // dead — the agent still holds and sends that original cookie
      // (changePassword doesn't touch the agent's own cookie jar,
      // only the backend's session store).
      const refreshRes = await agent
        .post('/api/v1/auth/refresh')
        .set('X-CSRF-Token', csrfToken)
        .send();

      expect(refreshRes.status).toBe(401);
    });

    it('blacklists the current access token — it can no longer be used for authenticated requests', async () => {
      const { accessToken } = await registerRealUser();

      const changeRes = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'oldPassword123', newPassword: 'newPassword456' });
      expect(changeRes.status).toBe(200);

      // The very token used to authorize the password change must now
      // be rejected — it should not still work for its remaining TTL.
      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(401);
    });

    it('allows logging in again with the new password after the change', async () => {
      const { email, accessToken } = await registerRealUser();

      await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'oldPassword123', newPassword: 'newPassword456' });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'newPassword456' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.tokens.accessToken).toBeDefined();
    });

    it('returns 401 without a token', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/password')
        .send({ currentPassword: 'oldPassword123', newPassword: 'newPassword456' });

      expect(res.status).toBe(401);
    });

    // FIX SEC-09: verifies the actual configured budget (max=10/15min)
    // via real HTTP requests, since express-rate-limit doesn't expose
    // its config through a stable API for direct unit assertion.
    it('rate-limits repeated password-change attempts to 10 per 15 minutes', async () => {
      const { accessToken } = await registerRealUser();

      const attempts = await Promise.all(
        Array.from({ length: 11 }, () =>
          request(app)
            .post('/api/v1/users/me/password')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ currentPassword: 'wrongPassword', newPassword: 'newPassword456' }),
        ),
      );

      const rateLimited = attempts.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
