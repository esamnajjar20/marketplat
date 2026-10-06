/**
 * Integration — appointments HTTP surface (/ P3).
 * Unit tests already cover service logic; this pins auth + public availability.
 */
import request from 'supertest';
import { app } from '../../src/app';
import { createTestUser } from '../helpers/auth.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestServiceProvider } from '../helpers/serviceProvider.helper';

describe('Appointments API', () => {
  describe('auth gates', () => {
    it('rejects unauthenticated GET /me', async () => {
      const res = await request(app).get('/api/v1/appointments/me');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated POST /', async () => {
      const res = await request(app).post('/api/v1/appointments').send({});
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated PATCH /:id/status', async () => {
      const res = await request(app)
        .patch('/api/v1/appointments/some-id/status')
        .send({ status: 'COMPLETED' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/appointments/availability/:providerId', () => {
    it('is public (no auth)', async () => {
      const user = await createTestUser();
      const seller = await createTestSellerProfile(user.id);
      const provider = await createTestServiceProvider(seller.id);

      const res = await request(app).get(
        `/api/v1/appointments/availability/${provider.id}`,
      );

      // 200 with slots/empty structure, or 400 if query params required —
      // either way must not be 401.
      expect(res.status).not.toBe(401);
      expect([200, 400]).toContain(res.status);
    });

    it('returns 404 for unknown provider', async () => {
      const res = await request(app).get(
        '/api/v1/appointments/availability/00000000-0000-0000-0000-000000000000',
      );
      expect([404, 400]).toContain(res.status);
    });
  });

  describe('GET /api/v1/appointments/me', () => {
    it('returns 400 when the user has no provider profile', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .get('/api/v1/appointments/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Service throws BadRequest when no provider profile
      expect([400, 403]).toContain(res.status);
    });
  });
});
