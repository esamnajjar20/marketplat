import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser, createTestAdmin } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';

describe('Admin API', () => {
  // FIX E2E-GAP-01: GET /admin/stats had zero integration (HTTP) test
  // coverage — only a unit test on adminService.getStats() directly
  // (tests/unit/admin.service.test.ts), which never exercises the real
  // route/middleware/controller chain (authenticate, requireAdmin,
  // successResponse envelope shape).
  describe('GET /api/v1/admin/stats', () => {
    it('returns the expected stats shape for an authenticated admin', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      await createTestAd(user.id);

      const res = await request(app)
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        totalAds: expect.any(Number),
        activeAds: expect.any(Number),
        totalUsers: expect.any(Number),
        activeUsers: expect.any(Number),
        openReports: expect.any(Number),
        viewsToday: expect.any(Number),
      });
      // The ad just created above must be reflected in the totals —
      // a stale/wrong query shape (e.g. missing a WHERE clause) would
      // still return 200 with a shape-valid but numerically wrong count.
      expect(res.body.data.totalAds).toBeGreaterThanOrEqual(1);
      expect(res.body.data.activeAds).toBeGreaterThanOrEqual(1);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/admin/stats');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin users with 403', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(403);
    });

    // FIX PERF-02 regression coverage via HTTP: getStats caches its
    // result in Redis for 30s (adminStatsCache.ts) — verifies that
    // cache is actually reachable through the real route, not just
    // adminService.getStats() called directly in the unit test. Creates
    // a new ad *between* the two requests: if the cache weren't
    // actually being hit, the second request's totalAds would go up;
    // proving it stays flat is what actually proves the cache path,
    // not just that two back-to-back calls happen to agree.
    it('serves a cached result on a second request — a new ad created in between is not reflected', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const first = await request(app)
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(first.status).toBe(200);

      await createTestAd(user.id);

      const second = await request(app)
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(second.status).toBe(200);
      expect(second.body.data.totalAds).toBe(first.body.data.totalAds);
    });
  });

  describe('GET /api/v1/admin/ads', () => {
    it('returns paginated ads with filters', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      await createTestAd(user.id);

      const res = await request(app)
        .get('/api/v1/admin/ads?status=ACTIVE&limit=10')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.pagination).toBeDefined();
    });
  });

  describe('PATCH /api/v1/admin/ads/:id/featured', () => {
    it('sets ad as featured', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .patch(`/api/v1/admin/ads/${ad.id}/featured`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ isFeatured: true });

      expect(res.status).toBe(200);
      expect(res.body.data.isFeatured).toBe(true);
    });

    it('returns 404 for non-existent ad', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .patch('/api/v1/admin/ads/non-existent-id/featured')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ isFeatured: true });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/admin/ads/:id/pinned', () => {
    it('pins an ad', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .patch(`/api/v1/admin/ads/${ad.id}/pinned`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ isPinned: true });

      expect(res.status).toBe(200);
      expect(res.body.data.isPinned).toBe(true);
    });
  });

  describe('DELETE /api/v1/admin/ads/:id', () => {
    it('force-deletes ad', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .delete(`/api/v1/admin/ads/${ad.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      const inDb = await prisma.ad.findUnique({ where: { id: ad.id } });
      expect(inDb?.status).toBe('DELETED');
    });
  });

  describe('GET /api/v1/admin/users', () => {
    it('returns paginated users', async () => {
      const admin = await createTestAdmin();
      await createTestUser();

      const res = await request(app)
        .get('/api/v1/admin/users?isActive=true')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('PATCH /api/v1/admin/users/:id/active', () => {
    it('deactivates user and blocks their token', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const deactivateRes = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/active`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ isActive: false });

      expect(deactivateRes.status).toBe(200);
      expect(deactivateRes.body.data.isActive).toBe(false);

      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(meRes.status).toBe(401);
    });

    it('returns 404 for non-existent user', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .patch('/api/v1/admin/users/non-existent-id/active')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(404);
    });
  });
});
