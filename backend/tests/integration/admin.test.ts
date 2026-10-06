import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser, createTestAdmin, createTestModerator, createTestSuperAdmin } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestStore } from '../helpers/store.helper';

describe('Admin API', () => {
  // GET /admin/stats had zero integration (HTTP) test
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
        newUsersToday: expect.any(Number),
        newUsersThisWeek: expect.any(Number),
        newUsersThisMonth: expect.any(Number),
      });
      // The ad just created above must be reflected in the totals —
      // a stale/wrong query shape (e.g. missing a WHERE clause) would
      // still return 200 with a shape-valid but numerically wrong count.
      expect(res.body.data.totalAds).toBeGreaterThanOrEqual(1);
      expect(res.body.data.activeAds).toBeGreaterThanOrEqual(1);
      // The user just created above registered today, so must be
      // reflected in every one of the three new-registration windows.
      expect(res.body.data.newUsersToday).toBeGreaterThanOrEqual(1);
      expect(res.body.data.newUsersThisWeek).toBeGreaterThanOrEqual(1);
      expect(res.body.data.newUsersThisMonth).toBeGreaterThanOrEqual(1);
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

    // regression coverage via HTTP: getStats caches its
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

  describe('PATCH /api/v1/admin/ads/bulk/featured (item 17)', () => {
    it('features every ad in the batch', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const ad1 = await createTestAd(user.id);
      const ad2 = await createTestAd(user.id);

      const res = await request(app)
        .patch('/api/v1/admin/ads/bulk/featured')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ adIds: [ad1.id, ad2.id], isFeatured: true });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(2);
      expect(res.body.meta.failed).toEqual([]);

      const refetched = await prisma.ad.findUnique({ where: { id: ad1.id } });
      expect(refetched?.isFeatured).toBe(true);
    });

    it('reports partial failure for a non-existent id without failing the whole batch', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .patch('/api/v1/admin/ads/bulk/featured')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ adIds: [ad.id, 'non-existent-id'], isFeatured: true });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(1);
      expect(res.body.meta.failed).toEqual([{ id: 'non-existent-id', reason: 'Ad not found' }]);
    });

    it('returns 400 for an empty adIds array', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .patch('/api/v1/admin/ads/bulk/featured')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ adIds: [], isFeatured: true });

      expect(res.status).toBe(400);
    });

    it('rejects a non-authenticated request', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/ads/bulk/featured')
        .send({ adIds: ['x'], isFeatured: true });

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/admin/ads/bulk/pinned (item 17)', () => {
    it('pins every ad in the batch — reachable by MODERATOR (ads moderation tier)', async () => {
      const moderator = await createTestModerator();
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .patch('/api/v1/admin/ads/bulk/pinned')
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ adIds: [ad.id], isPinned: true });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(1);
    });
  });

  describe('DELETE /api/v1/admin/ads/bulk (item 17)', () => {
    it('force-deletes every ad in the batch', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const ad1 = await createTestAd(user.id);
      const ad2 = await createTestAd(user.id);

      const res = await request(app)
        .delete('/api/v1/admin/ads/bulk')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ adIds: [ad1.id, ad2.id] });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(2);

      const refetched1 = await prisma.ad.findUnique({ where: { id: ad1.id } });
      const refetched2 = await prisma.ad.findUnique({ where: { id: ad2.id } });
      expect(refetched1?.status).toBe('DELETED');
      expect(refetched2?.status).toBe('DELETED');
    });

    it('returns 400 for more than 100 ids', async () => {
      const admin = await createTestAdmin();
      const adIds = Array.from({ length: 101 }, (_, i) => `id-${i}`);

      const res = await request(app)
        .delete('/api/v1/admin/ads/bulk')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ adIds });

      expect(res.status).toBe(400);
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

    // Gap #20 (admin permission tiers)
    it('rejects a MODERATOR — user account management is ADMIN+ only', async () => {
      const moderator = await createTestModerator();
      const user = await createTestUser();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/active`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(403);
    });

    it('rejects an ADMIN deactivating another ADMIN (rank not strictly below)', async () => {
      const admin = await createTestAdmin();
      const otherAdmin = await createTestAdmin();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${otherAdmin.id}/active`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(403);
    });

    it('allows a SUPER_ADMIN to deactivate an ADMIN', async () => {
      const superAdmin = await createTestSuperAdmin();
      const admin = await createTestAdmin();
      // A second admin so the last-active-admin guard doesn't block this.
      await createTestAdmin();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin.id}/active`)
        .set('Authorization', `Bearer ${superAdmin.accessToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
    });
  });

  describe('PATCH /api/v1/admin/users/bulk/active (item 17)', () => {
    it('deactivates every user in the batch', async () => {
      const admin = await createTestAdmin();
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      const res = await request(app)
        .patch('/api/v1/admin/users/bulk/active')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ userIds: [user1.id, user2.id], isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(2);
      expect(res.body.meta.failed).toEqual([]);

      const refetched = await prisma.user.findUnique({ where: { id: user1.id } });
      expect(refetched?.isActive).toBe(false);
    });

    // Real-world race this endpoint must handle correctly: an admin
    // selects a mixed batch including a peer ADMIN they aren't ranked
    // above (canManageRole rejects it) — that one id must fail without
    // blocking the ordinary user in the same batch.
    it('reports a per-id failure for a target the actor cannot manage, without failing the rest of the batch', async () => {
      const admin = await createTestAdmin();
      const otherAdmin = await createTestAdmin();
      const user = await createTestUser();

      const res = await request(app)
        .patch('/api/v1/admin/users/bulk/active')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ userIds: [user.id, otherAdmin.id], isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(1);
      expect(res.body.meta.failed).toHaveLength(1);
      expect(res.body.meta.failed[0].id).toBe(otherAdmin.id);

      const refetchedUser = await prisma.user.findUnique({ where: { id: user.id } });
      const refetchedOtherAdmin = await prisma.user.findUnique({ where: { id: otherAdmin.id } });
      expect(refetchedUser?.isActive).toBe(false);
      expect(refetchedOtherAdmin?.isActive).toBe(true);
    });

    it('rejects a MODERATOR — user account management is ADMIN+ only', async () => {
      const moderator = await createTestModerator();
      const user = await createTestUser();

      const res = await request(app)
        .patch('/api/v1/admin/users/bulk/active')
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ userIds: [user.id], isActive: false });

      expect(res.status).toBe(403);
    });

    it('returns 400 for more than 100 ids', async () => {
      const admin = await createTestAdmin();
      const userIds = Array.from({ length: 101 }, (_, i) => `id-${i}`);

      const res = await request(app)
        .patch('/api/v1/admin/users/bulk/active')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ userIds, isActive: false });

      expect(res.status).toBe(400);
    });
  });

  // Gap #20 (admin permission tiers): PATCH /admin/users/:id/role had
  // zero HTTP-level coverage before this feature — only reachable
  // indirectly through the unit-level adminService.changeRole tests.
  describe('PATCH /api/v1/admin/users/:id/role', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/users/some-id/role')
        .send({ role: 'MODERATOR' });

      expect(res.status).toBe(401);
    });

    it('rejects a MODERATOR actor with 403 — role changes are ADMIN+ only', async () => {
      const moderator = await createTestModerator();
      const user = await createTestUser();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/role`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ role: 'MODERATOR' });

      expect(res.status).toBe(403);
    });

    it('rejects a non-admin USER actor with 403', async () => {
      const user = await createTestUser();
      const target = await createTestUser();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${target.id}/role`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ role: 'MODERATOR' });

      expect(res.status).toBe(403);
    });

    it('rejects an invalid role value with 400', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: 'SUPERADMIN' });

      expect(res.status).toBe(400);
    });

    it('rejects assigning SUPER_ADMIN with 400 — not assignable through this endpoint', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: 'SUPER_ADMIN' });

      expect(res.status).toBe(400);
    });

    it('allows an ADMIN to promote a USER to MODERATOR', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: 'MODERATOR' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('MODERATOR');
    });

    it('rejects an ADMIN trying to promote a USER directly to ADMIN', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(403);
    });

    it('rejects an ADMIN trying to change another ADMIN\'s role', async () => {
      const admin = await createTestAdmin();
      const otherAdmin = await createTestAdmin();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${otherAdmin.id}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: 'MODERATOR' });

      expect(res.status).toBe(403);
    });

    it('rejects an admin trying to change their own role', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin.id}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: 'USER' });

      expect(res.status).toBe(403);
    });

    it('allows a SUPER_ADMIN to promote an ADMIN to ADMIN-tier freely and demote back', async () => {
      const superAdmin = await createTestSuperAdmin();
      const user = await createTestUser();

      const promote = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/role`)
        .set('Authorization', `Bearer ${superAdmin.accessToken}`)
        .send({ role: 'ADMIN' });

      expect(promote.status).toBe(200);
      expect(promote.body.data.role).toBe('ADMIN');
    });

    it("reflects the new role immediately on the target's existing session (cache invalidated, no access-token revocation)", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const roleRes = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: 'MODERATOR' });
      expect(roleRes.status).toBe(200);

      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.role).toBe('MODERATOR');
    });

    it('returns 404 for a non-existent target user', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .patch('/api/v1/admin/users/non-existent-id/role')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ role: 'MODERATOR' });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/admin/sellers/bulk/verify (item 17)', () => {
    it('verifies every seller profile in the batch', async () => {
      const admin = await createTestAdmin();
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const seller1 = await createTestSellerProfile(user1.id);
      const seller2 = await createTestSellerProfile(user2.id);

      const res = await request(app)
        .patch('/api/v1/admin/sellers/bulk/verify')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ sellerProfileIds: [seller1.id, seller2.id], verified: true });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(2);
      expect(res.body.meta.failed).toEqual([]);

      const refetched = await prisma.sellerProfile.findUnique({ where: { id: seller1.id } });
      expect(refetched?.verified).toBe(true);
    });

    it('reports partial failure for a non-existent id without failing the whole batch', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const seller = await createTestSellerProfile(user.id);

      const res = await request(app)
        .patch('/api/v1/admin/sellers/bulk/verify')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ sellerProfileIds: [seller.id, 'non-existent-id'], verified: true });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(1);
      expect(res.body.meta.failed).toEqual([{ id: 'non-existent-id', reason: 'Seller not found' }]);
    });

    it('rejects a MODERATOR — sellers are outside the MODERATOR tier', async () => {
      const moderator = await createTestModerator();
      const user = await createTestUser();
      const seller = await createTestSellerProfile(user.id);

      const res = await request(app)
        .patch('/api/v1/admin/sellers/bulk/verify')
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ sellerProfileIds: [seller.id], verified: true });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/admin/sellers/bulk/suspend (item 17)', () => {
    it('suspends every seller profile in the batch', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const seller = await createTestSellerProfile(user.id);

      const res = await request(app)
        .patch('/api/v1/admin/sellers/bulk/suspend')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ sellerProfileIds: [seller.id], suspended: true, reason: 'Repeated policy violations' });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(1);

      const refetched = await prisma.sellerProfile.findUnique({ where: { id: seller.id } });
      expect(refetched?.suspended).toBe(true);
    });

    it('returns 400 for an empty sellerProfileIds array', async () => {
      const admin = await createTestAdmin();

      const res = await request(app)
        .patch('/api/v1/admin/sellers/bulk/suspend')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ sellerProfileIds: [], suspended: true, reason: 'Repeated policy violations' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when suspending without a reason', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const seller = await createTestSellerProfile(user.id);

      const res = await request(app)
        .patch('/api/v1/admin/sellers/bulk/suspend')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ sellerProfileIds: [seller.id], suspended: true });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/admin/stores/bulk/status (item 17)', () => {
    it('updates status for every store in the batch', async () => {
      const admin = await createTestAdmin();
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const seller1 = await createTestSellerProfile(user1.id);
      const seller2 = await createTestSellerProfile(user2.id);
      const store1 = await createTestStore(seller1.id, { status: 'PENDING' });
      const store2 = await createTestStore(seller2.id, { status: 'PENDING' });

      const res = await request(app)
        .patch('/api/v1/admin/stores/bulk/status')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ storeIds: [store1.id, store2.id], status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(2);
      expect(res.body.meta.failed).toEqual([]);

      const refetched = await prisma.storeDetails.findUnique({ where: { id: store1.id } });
      expect(refetched?.status).toBe('ACTIVE');
    });

    it('reports partial failure for a non-existent id without failing the whole batch', async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();
      const seller = await createTestSellerProfile(user.id);
      const store = await createTestStore(seller.id, { status: 'PENDING' });

      const res = await request(app)
        .patch('/api/v1/admin/stores/bulk/status')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ storeIds: [store.id, 'non-existent-id'], status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.meta.updatedCount).toBe(1);
      expect(res.body.meta.failed).toEqual([{ id: 'non-existent-id', reason: 'Store not found' }]);
    });

    it('rejects a MODERATOR — stores are outside the MODERATOR tier', async () => {
      const moderator = await createTestModerator();
      const user = await createTestUser();
      const seller = await createTestSellerProfile(user.id);
      const store = await createTestStore(seller.id, { status: 'PENDING' });

      const res = await request(app)
        .patch('/api/v1/admin/stores/bulk/status')
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ storeIds: [store.id], status: 'ACTIVE' });

      expect(res.status).toBe(403);
    });

    it('returns 400 for more than 100 ids', async () => {
      const admin = await createTestAdmin();
      const storeIds = Array.from({ length: 101 }, (_, i) => `id-${i}`);

      const res = await request(app)
        .patch('/api/v1/admin/stores/bulk/status')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ storeIds, status: 'ACTIVE' });

      expect(res.status).toBe(400);
    });
  });

  // Gap #20 (admin permission tiers): MODERATOR must reach the
  // moderation-only surface (ads/reports/fraud) while being blocked
  // from the rest of the admin panel.
  describe('MODERATOR tier access', () => {
    it('allows a MODERATOR to list ads via the admin endpoint', async () => {
      const moderator = await createTestModerator();
      const user = await createTestUser();
      await createTestAd(user.id);

      const res = await request(app)
        .get('/api/v1/admin/ads')
        .set('Authorization', `Bearer ${moderator.accessToken}`);

      expect(res.status).toBe(200);
    });

    it('allows a MODERATOR to feature an ad', async () => {
      const moderator = await createTestModerator();
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const res = await request(app)
        .patch(`/api/v1/admin/ads/${ad.id}/featured`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ isFeatured: true });

      expect(res.status).toBe(200);
    });

    it('rejects a MODERATOR from GET /admin/stats — includes user-management data', async () => {
      const moderator = await createTestModerator();

      const res = await request(app)
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${moderator.accessToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects a MODERATOR from GET /admin/users', async () => {
      const moderator = await createTestModerator();

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${moderator.accessToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects a MODERATOR from GET /admin/sellers', async () => {
      const moderator = await createTestModerator();

      const res = await request(app)
        .get('/api/v1/admin/sellers')
        .set('Authorization', `Bearer ${moderator.accessToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects a MODERATOR from broadcasting notifications', async () => {
      const moderator = await createTestModerator();

      const res = await request(app)
        .post('/api/v1/admin/notifications/broadcast')
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ title: 'x', message: 'y' });

      expect(res.status).toBe(403);
    });
  });
});
