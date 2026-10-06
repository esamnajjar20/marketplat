/**
 * Integration — service-requests HTTP surface (/ P3).
 */
import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';

describe('Service Requests API', () => {
  describe('auth gates', () => {
    it('rejects unauthenticated GET /me', async () => {
      const res = await request(app).get('/api/v1/service-requests/me');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated GET /incoming', async () => {
      const res = await request(app).get('/api/v1/service-requests/incoming');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated POST /', async () => {
      const res = await request(app).post('/api/v1/service-requests').send({});
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated GET /:id', async () => {
      const res = await request(app).get('/api/v1/service-requests/some-id');
      expect(res.status).toBe(401);
    });
  });

  describe('authenticated customer list', () => {
    it('returns 200 with a list (possibly empty) for GET /me', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .get('/api/v1/service-requests/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(Array.isArray(data) || Array.isArray(data?.items)).toBe(true);
    });

    it('rejects empty create body with 400', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .post('/api/v1/service-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
