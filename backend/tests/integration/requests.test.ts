/**
 * Open Requests HTTP surface — auth gates + empty feed.
 */
import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';

describe('Requests API', () => {
  describe('auth gates', () => {
    it('rejects unauthenticated GET /', async () => {
      const res = await request(app).get('/api/v1/requests');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated POST /', async () => {
      const res = await request(app).post('/api/v1/requests').send({});
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated GET /me', async () => {
      const res = await request(app).get('/api/v1/requests/me');
      expect(res.status).toBe(401);
    });
  });

  describe('authenticated feed', () => {
    it('returns 200 with paginated items for GET /', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(Array.isArray(data) || Array.isArray(data?.items)).toBe(true);
    });

    it('rejects empty create body with 400', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
