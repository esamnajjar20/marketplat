import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';

describe('Favorites API', () => {
  describe('POST /api/v1/favorites/:adId', () => {
    it('adds ad to favorites', async () => {
      const owner = await createTestUser();
      const user = await createTestUser();
      const ad = await createTestAd(owner.id);

      const res = await request(app)
        .post(`/api/v1/favorites/${ad.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.action).toBe('added');
    });

    it('removes ad from favorites on second toggle', async () => {
      const owner = await createTestUser();
      const user = await createTestUser();
      const ad = await createTestAd(owner.id);

      await request(app)
        .post(`/api/v1/favorites/${ad.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const res = await request(app)
        .post(`/api/v1/favorites/${ad.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.action).toBe('removed');
    });

    it('returns 404 for non-existent ad', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/v1/favorites/non-existent-id')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).post('/api/v1/favorites/some-id');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/favorites', () => {
    it('returns paginated favorites for authenticated user', async () => {
      const owner = await createTestUser();
      const user = await createTestUser();
      const ad = await createTestAd(owner.id);

      await request(app)
        .post(`/api/v1/favorites/${ad.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const res = await request(app)
        .get('/api/v1/favorites')
        .query({ page: '1', limit: '20' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.meta.pagination).toBeDefined();
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/favorites');
      expect(res.status).toBe(401);
    });
  });
});
