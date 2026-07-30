import { adminService } from '../../src/modules/admin/admin.service';
import { prisma } from '../../src/config/prisma';
import { userCache } from '../../src/shared/utils/userCache';
import { tokenStore } from '../../src/shared/utils/tokenStore';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { Prisma } from '@prisma/client';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';
import { createTestCategory } from '../helpers/category.helper';

jest.mock('../../src/shared/utils/auditLog', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
  AuditEvent: {
    ADMIN_AD_FEATURED: 'ADMIN_AD_FEATURED',
    ADMIN_AD_PINNED: 'ADMIN_AD_PINNED',
    ADMIN_AD_DELETED: 'ADMIN_AD_DELETED',
    ADMIN_USER_STATUS_CHANGED: 'ADMIN_USER_STATUS_CHANGED',
  },
}));

describe('AdminService', () => {
  beforeEach(() => jest.clearAllMocks());

  afterEach(() => jest.restoreAllMocks());

  // FIX PERF-02: getStats previously had zero test coverage despite
  // aggregating across 5 tables — and now also caches via Redis, which
  // is exactly the kind of behavior (stale-read window, cache miss vs
  // hit) that needs its own explicit coverage.
  describe('getStats', () => {
    it('computes stats from the database on a cache miss and returns them', async () => {
      jest.spyOn(prisma.ad, 'count')
        .mockResolvedValueOnce(100) // totalAds
        .mockResolvedValueOnce(80); // activeAds
      jest.spyOn(prisma.user, 'count')
        .mockResolvedValueOnce(50) // totalUsers
        .mockResolvedValueOnce(45); // activeUsers
      jest.spyOn(prisma.report, 'count').mockResolvedValue(3);
      jest.spyOn(prisma.ad, 'aggregate').mockResolvedValue({ _sum: { views: 120 } } as any);

      const stats = await adminService.getStats();

      expect(stats).toEqual({
        totalAds: 100,
        activeAds: 80,
        totalUsers: 50,
        activeUsers: 45,
        openReports: 3,
        viewsToday: 120,
      });
    });

    it('serves the cached result on a second call without hitting the database again', async () => {
      const countSpy = jest.spyOn(prisma.ad, 'count')
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80);
      jest.spyOn(prisma.user, 'count').mockResolvedValueOnce(50).mockResolvedValueOnce(45);
      jest.spyOn(prisma.report, 'count').mockResolvedValue(3);
      jest.spyOn(prisma.ad, 'aggregate').mockResolvedValue({ _sum: { views: 120 } } as any);

      const first = await adminService.getStats();
      const second = await adminService.getStats();

      expect(second).toEqual(first);
      // Only the first call should have actually queried the DB — the
      // second is served entirely from the Redis cache.
      expect(countSpy).toHaveBeenCalledTimes(2); // ad.count called twice per DB round (total+active)
    });

    it('treats a null views aggregate as 0 rather than null/undefined', async () => {
      jest.spyOn(prisma.ad, 'count').mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      jest.spyOn(prisma.user, 'count').mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      jest.spyOn(prisma.report, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.ad, 'aggregate').mockResolvedValue({ _sum: { views: null } } as any);

      const stats = await adminService.getStats();

      expect(stats.viewsToday).toBe(0);
    });
  });

  describe('getAllAds', () => {
    it('returns paginated ads', async () => {
      const user = await createTestUser();
      await createTestAd(user.id);

      const result = await adminService.getAllAds({ page: 1, limit: 10, status: 'ACTIVE' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.meta.total).toBeGreaterThanOrEqual(1);
    });

    // FIX INTEG-01: the frontend's AdCategory type (types/ad.types.ts)
    // requires { id, name, nameAr } on every ad's category — this used
    // to select only { id, name }, silently leaving category.nameAr
    // undefined at runtime despite TypeScript treating it as a
    // guaranteed string on the frontend. This test pins the full shape
    // down so a future select-list edit can't silently drop a field
    // the frontend type contract depends on.
    it('includes category with id, name, and nameAr (not just id/name)', async () => {
      const user = await createTestUser();
      const category = await createTestCategory({ name: 'Electronics', nameAr: 'إلكترونيات' });
      await createTestAd(user.id, { categoryId: category.id });

      const result = await adminService.getAllAds({ page: 1, limit: 10 });
      const found = result.items.find((ad: any) => ad.categoryId === category.id);

      expect(found).toBeDefined();
      expect((found as any).category).toEqual({
        id: category.id,
        name: 'Electronics',
        nameAr: 'إلكترونيات',
      });
    });

    it('includes user with id, name, and email', async () => {
      const user = await createTestUser({ name: 'Test Seller', email: 'seller@test.com' });
      const ad = await createTestAd(user.id);

      const result = await adminService.getAllAds({ page: 1, limit: 10 });
      const found = result.items.find((a: any) => a.id === ad.id);

      expect((found as any).user).toEqual({
        id: user.id,
        name: 'Test Seller',
        email: 'seller@test.com',
      });
    });

    it('includes _count.reports', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const result = await adminService.getAllAds({ page: 1, limit: 10 });
      const found = result.items.find((a: any) => a.id === ad.id);

      expect((found as any)._count).toEqual({ reports: 0 });
    });

    // BUGFIX coverage: `q` was silently stripped by admin.validation.ts
    // before ever reaching here (see that file's fix) — the search box
    // in AdminAdsTable looked functional but filtered nothing.
    it('filters by q against the ad title, case-insensitively', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { title: 'iPhone 15 Pro Max' });
      await createTestAd(user.id, { title: 'Samsung Galaxy S24' });

      const result = await adminService.getAllAds({ page: 1, limit: 10, q: 'iphone' });

      expect(result.items).toHaveLength(1);
      expect((result.items[0] as any).title).toBe('iPhone 15 Pro Max');
    });

    it('returns no results when q matches no ad title', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { title: 'iPhone 15 Pro Max' });

      const result = await adminService.getAllAds({ page: 1, limit: 10, q: 'nonexistent-xyz' });

      expect(result.items).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('setAdFeatured', () => {
    it('updates featured flag', async () => {
      jest.spyOn(prisma.ad, 'update').mockResolvedValue({ id: 'ad-1', isFeatured: true } as any);
      const result = await adminService.setAdFeatured('ad-1', true);
      expect(result.isFeatured).toBe(true);
    });

    it('throws NotFoundError on P2025', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      jest.spyOn(prisma.ad, 'update').mockRejectedValue(err);
      await expect(adminService.setAdFeatured('missing', true)).rejects.toThrow(NotFoundError);
    });

    /**
     * BUGFIX regression test — found during a post-implementation code
     * audit. Previously setAdFeatured/setAdPinned/forceDeleteAd never
     * invalidated the GET /ads list cache (ads.service.ts's
     * ADS_CACHE_VERSION_KEY) at all — an admin toggling a featured/
     * pinned flag, or force-deleting an ad, could still see the stale
     * value served to browsing users for up to the cache's 30s TTL.
     * Confirmed here via the same redis mock ads.service.ts's own cache
     * reads from (tests/setup.ts) — the version counter must actually
     * increment.
     */
    it('BUGFIX: bumps the ads list cache version so the change is visible immediately', async () => {
      const { redis } = await import('../../src/config/redis');
      jest.spyOn(prisma.ad, 'update').mockResolvedValue({ id: 'ad-1', isFeatured: true } as any);

      const before = await redis.get('ads:cache_version');
      await adminService.setAdFeatured('ad-1', true);
      const after = await redis.get('ads:cache_version');

      expect(Number(after ?? 0)).toBe(Number(before ?? 0) + 1);
    });
  });

  describe('setAdPinned', () => {
    it('throws NotFoundError on P2025', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      jest.spyOn(prisma.ad, 'update').mockRejectedValue(err);
      await expect(adminService.setAdPinned('missing', true)).rejects.toThrow(NotFoundError);
    });

    it('BUGFIX: bumps the ads list cache version so the change is visible immediately', async () => {
      const { redis } = await import('../../src/config/redis');
      jest.spyOn(prisma.ad, 'update').mockResolvedValue({ id: 'ad-1', isPinned: true } as any);

      const before = await redis.get('ads:cache_version');
      await adminService.setAdPinned('ad-1', true);
      const after = await redis.get('ads:cache_version');

      expect(Number(after ?? 0)).toBe(Number(before ?? 0) + 1);
    });
  });

  describe('forceDeleteAd', () => {
    it('soft deletes ad', async () => {
      jest.spyOn(prisma.ad, 'update').mockResolvedValue({ id: 'ad-1', status: 'DELETED' } as any);
      await expect(adminService.forceDeleteAd('ad-1')).resolves.toBeUndefined();
    });

    /**
     * BUGFIX regression test — the most important of the three: an
     * admin force-deleting an ad for an urgent reason (fraud, a policy
     * violation, a legal takedown) is exactly the case where "still
     * visible to other users for up to 30 more seconds" matters most.
     */
    it('BUGFIX: bumps the ads list cache version so the deleted ad stops appearing immediately', async () => {
      const { redis } = await import('../../src/config/redis');
      jest.spyOn(prisma.ad, 'update').mockResolvedValue({ id: 'ad-1', status: 'DELETED' } as any);

      const before = await redis.get('ads:cache_version');
      await adminService.forceDeleteAd('ad-1');
      const after = await redis.get('ads:cache_version');

      expect(Number(after ?? 0)).toBe(Number(before ?? 0) + 1);
    });

    it('does NOT bump the cache version when the update fails (P2025) — nothing actually changed', async () => {
      const { redis } = await import('../../src/config/redis');
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      jest.spyOn(prisma.ad, 'update').mockRejectedValue(err);

      const before = await redis.get('ads:cache_version');
      await expect(adminService.forceDeleteAd('missing')).rejects.toThrow(NotFoundError);
      const after = await redis.get('ads:cache_version');

      expect(after).toBe(before);
    });
  });

  describe('getAllUsers', () => {
    // BUGFIX: this previously mocked prisma.$transaction, but
    // getAllUsers (admin.service.ts) uses Promise.all([findMany,
    // count]), never $transaction — that mock was inert and the test
    // only ever exercised the real, unmocked prisma.user.findMany/count
    // against the test DB. Rewritten against the real DB directly,
    // matching the pattern already used by the getAllAds suite above.
    it('filters by isActive', async () => {
      await createTestUser({ email: `active-${Date.now()}@example.com` });
      const inactiveUser = await createTestUser({ email: `inactive-${Date.now()}@example.com` });
      await prisma.user.update({ where: { id: inactiveUser.id }, data: { isActive: false } });

      const result = await adminService.getAllUsers({ isActive: true });

      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.every((u: any) => u.isActive === true)).toBe(true);
      expect(result.items.some((u: any) => u.id === inactiveUser.id)).toBe(false);
    });

    // BUGFIX coverage: `q` was silently stripped by admin.validation.ts
    // before ever reaching here (see that file's fix) — the search box
    // in AdminUsersTable looked functional but filtered nothing.
    it('filters by q against name, case-insensitively', async () => {
      const target = await createTestUser({ name: 'Ahmad Khaled', email: `ahmad-${Date.now()}@example.com` });
      await createTestUser({ name: 'Sara Ali', email: `sara-${Date.now()}@example.com` });

      const result = await adminService.getAllUsers({ page: 1, limit: 10, q: 'ahmad' });

      expect(result.items.some((u: any) => u.id === target.id)).toBe(true);
      expect(result.items.every((u: any) => /ahmad/i.test(u.name) || /ahmad/i.test(u.email))).toBe(true);
    });

    it('filters by q against email when it does not match the name', async () => {
      const target = await createTestUser({
        name: 'Test User',
        email: `unique-marker-${Date.now()}@example.com`,
      });

      const result = await adminService.getAllUsers({ page: 1, limit: 10, q: 'unique-marker' });

      expect(result.items.some((u: any) => u.id === target.id)).toBe(true);
    });

    it('returns no results when q matches neither name nor email', async () => {
      await createTestUser({ name: 'Ahmad Khaled', email: `ahmad-${Date.now()}@example.com` });

      const result = await adminService.getAllUsers({ page: 1, limit: 10, q: 'nonexistent-xyz' });

      expect(result.items).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('toggleUserActive', () => {
    beforeEach(() => {
      // FIX SEC-08: toggleUserActive now wraps its read+guard+write in
      // prisma.$transaction(async (tx) => {...}) instead of separate
      // top-level prisma.* calls. Since tx.user.* and prisma.user.* are
      // the same jest.spyOn-mocked methods, executing the callback with
      // `prisma` itself as `tx` lets every existing spyOn(prisma.user, …)
      // call below keep working unmodified.
      jest.spyOn(prisma, '$transaction').mockImplementation((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.resolve(arg),
      );
    });

    it('revokes sessions when deactivating a non-admin user', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ role: 'USER' } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'u1',
        name: 'Test',
        email: 't@t.com',
        isActive: false,
      } as any);
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);

      const result = await adminService.toggleUserActive('u1', false, 'admin-1');
      expect(result.isActive).toBe(false);
      expect(tokenStore.deleteAllRefreshTokens).toHaveBeenCalledWith('u1');
    });

    it('does not revoke sessions when activating', async () => {
      jest.spyOn(prisma.user, 'findUnique');
      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'u1',
        name: 'Test',
        email: 't@t.com',
        isActive: true,
      } as any);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);

      // Activating (isActive=true) never calls findUnique — only the
      // deactivation path needs to check role/admin-count.
      await adminService.toggleUserActive('u1', true, 'admin-1');
      expect(tokenStore.deleteAllRefreshTokens).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundError on P2025', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ role: 'USER' } as any);
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      jest.spyOn(prisma.user, 'update').mockRejectedValue(err);
      await expect(adminService.toggleUserActive('missing', false, 'admin-1')).rejects.toThrow(NotFoundError);
    });

    // FIX SEC-08 coverage: a Postgres serialization conflict (two
    // concurrent admin-status changes racing each other) must surface
    // as a clear, retryable client error — not a generic 500.
    it('translates a P2034 transaction conflict into a friendly retry message', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
        code: 'P2034',
        clientVersion: '5.0.0',
      });
      jest.spyOn(prisma, '$transaction').mockRejectedValue(err);

      await expect(
        adminService.toggleUserActive('u1', false, 'admin-1'),
      ).rejects.toThrow('This action conflicted with another operation, please try again');
    });

    // --- New guards added in this round ---

    it('rejects an admin trying to deactivate their own account', async () => {
      jest.spyOn(prisma.user, 'findUnique');
      jest.spyOn(prisma.user, 'update');

      await expect(
        adminService.toggleUserActive('admin-1', false, 'admin-1'),
      ).rejects.toThrow('You cannot deactivate your own account');

      // Should fail fast — never even queries the target user.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects deactivating the last remaining active admin', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ role: 'ADMIN' } as any);
      jest.spyOn(prisma.user, 'count').mockResolvedValue(1);
      jest.spyOn(prisma.user, 'update');

      await expect(
        adminService.toggleUserActive('admin-2', false, 'admin-1'),
      ).rejects.toThrow('Cannot deactivate the last active admin in the system');

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows deactivating an admin when other active admins remain', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ role: 'ADMIN' } as any);
      jest.spyOn(prisma.user, 'count').mockResolvedValue(2);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'admin-2', name: 'Other Admin', email: 'a2@t.com', isActive: false,
      } as any);
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);

      const result = await adminService.toggleUserActive('admin-2', false, 'admin-1');
      expect(result.isActive).toBe(false);
    });

    it('does not run the admin-count check when deactivating a non-admin', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ role: 'USER' } as any);
      const countSpy = jest.spyOn(prisma.user, 'count');
      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'u2', name: 'User', email: 'u2@t.com', isActive: false,
      } as any);
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);

      await adminService.toggleUserActive('u2', false, 'admin-1');
      expect(countSpy).not.toHaveBeenCalled();
    });
  });

  // FIX SEC-08 / gap: changeRole previously had zero unit test coverage
  // despite the same last-admin/self-demotion guards as toggleUserActive.
  describe('changeRole', () => {
    beforeEach(() => {
      jest.spyOn(prisma, '$transaction').mockImplementation((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.resolve(arg),
      );
    });

    it('rejects an admin trying to demote themselves to USER', async () => {
      jest.spyOn(prisma.user, 'findUnique');
      jest.spyOn(prisma.user, 'update');

      await expect(
        adminService.changeRole('admin-1', 'USER', 'admin-1'),
      ).rejects.toThrow('You cannot demote your own privileges');

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects demoting the last remaining active admin', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ role: 'ADMIN' } as any);
      jest.spyOn(prisma.user, 'count').mockResolvedValue(1);
      jest.spyOn(prisma.user, 'update');

      await expect(
        adminService.changeRole('admin-2', 'USER', 'admin-1'),
      ).rejects.toThrow('Cannot demote the last active admin in the system');

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows demoting an admin when other active admins remain', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ role: 'ADMIN' } as any);
      jest.spyOn(prisma.user, 'count').mockResolvedValue(2);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'admin-2', name: 'Other Admin', email: 'a2@t.com', role: 'USER',
      } as any);
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);

      const result = await adminService.changeRole('admin-2', 'USER', 'admin-1');
      expect(result.role).toBe('USER');
    });

    it('does not run the admin-count check when promoting a user to ADMIN', async () => {
      const countSpy = jest.spyOn(prisma.user, 'count');
      jest.spyOn(prisma.user, 'findUnique');
      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'u2', name: 'User', email: 'u2@t.com', role: 'ADMIN',
      } as any);
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);

      await adminService.changeRole('u2', 'ADMIN', 'admin-1');
      expect(countSpy).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('invalidates the cache and revokes sessions on every role change (not just demotions)', async () => {
      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'u2', name: 'User', email: 'u2@t.com', role: 'ADMIN',
      } as any);
      const invalidateSpy = jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
      const deleteAllSpy = jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);

      await adminService.changeRole('u2', 'ADMIN', 'admin-1');

      expect(invalidateSpy).toHaveBeenCalledWith('u2');
      expect(deleteAllSpy).toHaveBeenCalledWith('u2');
    });

    it('throws NotFoundError on P2025', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      jest.spyOn(prisma.user, 'update').mockRejectedValue(err);
      await expect(adminService.changeRole('missing', 'ADMIN', 'admin-1')).rejects.toThrow(NotFoundError);
    });

    it('translates a P2034 transaction conflict into a friendly retry message', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
        code: 'P2034',
        clientVersion: '5.0.0',
      });
      jest.spyOn(prisma, '$transaction').mockRejectedValue(err);

      await expect(
        adminService.changeRole('u1', 'ADMIN', 'admin-1'),
      ).rejects.toThrow('This action conflicted with another operation, please try again');
    });
  });
});
