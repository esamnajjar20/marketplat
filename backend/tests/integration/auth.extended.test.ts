import request from 'supertest';
import { app } from '../../src/app';

describe('Auth API — extended coverage', () => {
  const registerUser = async (prefix: string) => {
    const email = `${prefix}-${Date.now()}@test.com`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Auth Extended', email, password: 'password123', city: 'الرياض' });
    expect(res.status).toBe(201);
    return { email, ...res.body.data.tokens, userId: res.body.data.user.id };
  };

  describe('POST /api/v1/auth/logout-all', () => {
    it('invalidates all sessions', async () => {
      const { accessToken } = await registerUser('logout-all');

      const res = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);

      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/sessions', () => {
    it('returns active sessions for authenticated user', async () => {
      const { accessToken } = await registerUser('sessions');

      const res = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/auth/sessions');
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/auth/sessions/:sessionId', () => {
    it('returns 400 when revoking current session', async () => {
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Revoke Self',
          email: `revoke-self-${Date.now()}@test.com`,
          password: 'password123',
          city: 'الرياض',
        });

      const { accessToken } = registerRes.body.data.tokens;
      const sessionsRes = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`);

      const currentSessionId = sessionsRes.body.data.find((s: { isCurrent: boolean }) => s.isCurrent)?.sessionId;

      const res = await request(app)
        .delete(`/api/v1/auth/sessions/${currentSessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/current session/i);
    });
  });
});
