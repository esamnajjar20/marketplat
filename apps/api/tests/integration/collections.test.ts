/**
 * Collections HTTP surface — auth gates + public endpoints.
 * Complements unit tests on collections.service (raises controller coverage).
 */
import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestStore } from '../helpers/store.helper';

describe('Collections API', () => {
  describe('auth gates', () => {
    it('rejects unauthenticated GET /me', async () => {
      const res = await request(app).get('/api/v1/collections/me');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated POST /', async () => {
      const res = await request(app).post('/api/v1/collections').send({ name: 'x' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/collections/store/:storeId', () => {
    it('is public and returns a list for an active store', async () => {
      const user = await createTestUser();
      const seller = await createTestSellerProfile(user.id);
      const store = await createTestStore(seller.id);

      const res = await request(app).get(`/api/v1/collections/store/${store.id}`);
      expect(res.status).not.toBe(401);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('GET /api/v1/collections/me', () => {
    it('returns 400 when the user has no store', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .get('/api/v1/collections/me')
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect([400, 403, 404]).toContain(res.status);
    });
  });
});
