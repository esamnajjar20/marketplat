import { favoritesRepository } from '../../src/modules/favorites/favorites.repository';
import { prisma } from '../../src/config/prisma';

// FEAT-FAVORITE-POLYMORPHIC PR1: favoritesRepository no longer runs a
// single Prisma call with `include`/`where: { ad: {...} } }` — it does
// a batch fan-out (favorite rows, then ad rows) — so these mocks now
// cover both prisma.favorite.* and prisma.ad.* (findMany/count).
jest.mock('../../src/config/prisma', () => ({
  prisma: {
    favorite: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    ad: {
      findMany: jest.fn(),
    },
  },
}));

const userId = 'user-1';
const adId = 'ad-1';

describe('favoritesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findManyByUserId', () => {
    // FIX FAV-01 regression coverage, re-targeted at PR1's shape: a
    // favorited ad that's since been soft-deleted (status: DELETED)
    // must never appear in, or count toward the total of, "المفضلة".
    // The exclusion now happens via a second prisma.ad.findMany call
    // (status: { not: DELETED }) rather than inside the favorite
    // query's own `where`, since Favorite has no relation to Ad
    // anymore.
    // NOTE: findManyByUserId runs its own row fetch and countByUserId
    // (which internally fetches ad rows again for the active-count
    // check) inside a Promise.all — so the exact call-order of the two
    // separate prisma.ad.findMany invocations (main fan-out vs.
    // countByUserId's own) isn't guaranteed by that structure. This
    // test deliberately checks aggregate behavior across all
    // prisma.ad.findMany calls rather than asserting on a specific
    // call index, so it isn't coupled to an interleaving detail that
    // was never actually run against real Jest here (no network/
    // node_modules in this sandbox — verify locally before merging).
    it('excludes ads with status DELETED from at least one ad lookup', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
        { id: 'fav-1', userId, entityType: 'AD', entityId: 'ad-1', createdAt: new Date() },
      ]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([{ id: 'ad-1', status: 'ACTIVE' }]);

      await favoritesRepository.findManyByUserId(userId, {});

      const calls = (prisma.ad.findMany as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(
        calls.some((call) => JSON.stringify(call[0]?.where?.status) === JSON.stringify({ not: 'DELETED' }))
      ).toBe(true);
    });

    it('applies pagination skip/take from page and limit', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);

      await favoritesRepository.findManyByUserId(userId, { page: 3, limit: 10 });

      expect(prisma.favorite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    // Uses mockImplementation keyed on the `select` shape passed to
    // prisma.ad.findMany, rather than mockResolvedValueOnce call
    // ordering, since (as noted above) the two ad.findMany call sites
    // race inside the same Promise.all and their relative order isn't
    // something this test should assume.
    it('returns favorites joined with their ad entity, and the active-favorite total', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
        { id: 'fav-1', userId, entityType: 'AD', entityId: 'ad-1', createdAt: new Date('2026-01-01') },
      ]);
      (prisma.ad.findMany as jest.Mock).mockImplementation(({ select }) =>
        select?.title
          ? Promise.resolve([{ id: 'ad-1', status: 'ACTIVE', title: 'Test Ad' }])
          : Promise.resolve([{ id: 'ad-1' }])
      );

      const result = await favoritesRepository.findManyByUserId(userId, {});

      expect(result.total).toBe(1);
      expect(result.favorites).toHaveLength(1);
      expect(result.favorites[0].entity).toEqual({ id: 'ad-1', status: 'ACTIVE', title: 'Test Ad' });
    });

    it('drops a favorite row from the results when its ad is DELETED or missing', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
        { id: 'fav-1', userId, entityType: 'AD', entityId: 'ad-1', createdAt: new Date() },
      ]);
      // Main fan-out select returns the ad with status DELETED; the
      // active-check branch (no `title` in its select) correctly
      // finds nothing active.
      // fetchActive filters with status: { not: 'DELETED' } — a deleted
      // ad is never returned from that query. Simulate that here.
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);

      const result = await favoritesRepository.findManyByUserId(userId, {});

      expect(result.favorites).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('countByUserId (FIX BUG-07)', () => {
    it('counts only AD favorites whose ad is not DELETED', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
        { entityId: 'ad-1' },
        { entityId: 'ad-2' },
      ]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([
        { id: 'ad-1' },
        { id: 'ad-2' },
      ]);

      const result = await favoritesRepository.countByUserId(userId);

      expect(prisma.favorite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, entityType: 'AD' } })
      );
      expect(result).toBe(2);
    });

    // FIX BUG-07 regression guard: the whole point of this method is
    // that it has no page to outgrow — no skip/take on either query,
    // so it stays accurate however many favorites the user has.
    it('is not affected by favorite counts far beyond the old 100-item stats page-size cap', async () => {
      const manyFavorites = Array.from({ length: 640 }, (_, i) => ({ entityId: `ad-${i}` }));
      const manyActiveAds = Array.from({ length: 640 }, (_, i) => ({ id: `ad-${i}` }));
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue(manyFavorites);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue(manyActiveAds);

      const result = await favoritesRepository.countByUserId(userId);

      expect(result).toBe(640);
    });

    it('returns 0 without querying ads when the user has no AD favorites', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);

      const result = await favoritesRepository.countByUserId(userId);

      expect(result).toBe(0);
      expect(prisma.ad.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findUserIdsByAdId', () => {
    it('queries favorites by entityType AD + entityId and returns just the userIds', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);

      const result = await favoritesRepository.findUserIdsByAdId(adId);

      expect(prisma.favorite.findMany).toHaveBeenCalledWith({
        where: { entityType: 'AD', entityId: adId },
        select: { userId: true },
      });
      expect(result).toEqual(['u1', 'u2']);
    });

    it('returns an empty array when nobody favorited the ad', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);

      const result = await favoritesRepository.findUserIdsByAdId(adId);

      expect(result).toEqual([]);
    });
  });

  describe('findByUserAndEntity / create / delete (compatibility layer)', () => {
    it('findByUserAndEntity looks up by the new composite unique key', async () => {
      (prisma.favorite.findUnique as jest.Mock).mockResolvedValue(null);

      await favoritesRepository.findByUserAndEntity(userId, 'AD', adId);

      expect(prisma.favorite.findUnique).toHaveBeenCalledWith({
        where: { userId_entityType_entityId: { userId, entityType: 'AD', entityId: adId } },
      });
    });

    it('create writes entityType/entityId, not adId', async () => {
      (prisma.favorite.create as jest.Mock).mockResolvedValue({});

      await favoritesRepository.create(userId, 'AD', adId);

      expect(prisma.favorite.create).toHaveBeenCalledWith({
        data: { userId, entityType: 'AD', entityId: adId },
      });
    });

    it('delete removes by the new composite unique key', async () => {
      (prisma.favorite.delete as jest.Mock).mockResolvedValue({});

      await favoritesRepository.delete(userId, 'AD', adId);

      expect(prisma.favorite.delete).toHaveBeenCalledWith({
        where: { userId_entityType_entityId: { userId, entityType: 'AD', entityId: adId } },
      });
    });
  });
});
