import { favoritesRepository } from '../../src/modules/engagement/favorites/favorites.repository';
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
    $queryRaw: jest.fn(),
  },
}));

const userId = 'user-1';
const adId = 'ad-1';

describe('favoritesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findManyByUserId', () => {
    const sqlOf = (callIndex = 0) => (prisma.$queryRaw as jest.Mock).mock.calls[callIndex][0];
    const row = (id: string, entityId: string, total: number) => ({
      id, userId, entityType: 'AD', entityId, listId: null, createdAt: new Date('2026-01-01'), total,
    });

    // PERF: filtering (DELETED excluded), ordering, pagination and total are
    // one SQL query; only the current page's entities are then loaded.
    it('runs one paginated SQL query that excludes DELETED ads before LIMIT/OFFSET', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([row('fav-1', 'ad-1', 1)]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([{ id: 'ad-1', title: 'Test Ad' }]);

      await favoritesRepository.findManyByUserId(userId, { page: 3, limit: 10 });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.favorite.findMany).not.toHaveBeenCalled();
      const sql = sqlOf();
      const text = sql.strings.join('?');
      expect(text).toContain('"ads"');
      expect(text).toContain('LIMIT');
      expect(text).toContain('OFFSET');
      expect(sql.values).toEqual(expect.arrayContaining([userId, 'AD', 'DELETED', 10, 20]));
    });

    it('returns favorites joined with their entity, and the window total', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([row('fav-1', 'ad-1', 7)]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([{ id: 'ad-1', status: 'ACTIVE', title: 'Test Ad' }]);

      const result = await favoritesRepository.findManyByUserId(userId, {});

      expect(result.total).toBe(7);
      expect(result.favorites).toHaveLength(1);
      expect(result.favorites[0].entity).toEqual({ id: 'ad-1', status: 'ACTIVE', title: 'Test Ad' });
      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['ad-1'] }, status: { not: 'DELETED' } } })
      );
    });

    it('preserves SQL ordering even when entities come back in another order', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        row('fav-2', 'ad-2', 2),
        row('fav-1', 'ad-1', 2),
      ]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([{ id: 'ad-1' }, { id: 'ad-2' }]);

      const result = await favoritesRepository.findManyByUserId(userId, {});

      expect(result.favorites.map(f => f.entityId)).toEqual(['ad-2', 'ad-1']);
    });

    it('adds the listId filter as a bound parameter', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await favoritesRepository.findManyByUserId(userId, { listId: 'list-9' });

      const sql = sqlOf();
      expect(sql.strings.join('?')).toContain('"listId"');
      expect(sql.values).toContain('list-9');
    });

    it('returns an empty first page with total 0 without a second query', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await favoritesRepository.findManyByUserId(userId, {});

      expect(result).toEqual({ favorites: [], total: 0 });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.ad.findMany).not.toHaveBeenCalled();
    });

    it('keeps total accurate for a page past the end via one extra COUNT', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 12 }]);

      const result = await favoritesRepository.findManyByUserId(userId, { page: 9, limit: 10 });

      expect(result).toEqual({ favorites: [], total: 12 });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('drops a row whose entity disappeared between the SQL query and fetchActive', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([row('fav-1', 'ad-1', 1)]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);

      const result = await favoritesRepository.findManyByUserId(userId, {});

      expect(result.favorites).toHaveLength(0);
    });
  });

  describe('countByUserId (FIX BUG-07)', () => {
    // PERF: the count is now a single COUNT(DISTINCT) join in SQL, so it no
    // longer loads every favorite row nor does an `IN (...)` entity lookup.
    it('returns the count from one raw query without loading favorite rows', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: 2 }]);

      const result = await favoritesRepository.countByUserId(userId);

      expect(result).toBe(2);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.favorite.findMany).not.toHaveBeenCalled();
      expect(prisma.ad.findMany).not.toHaveBeenCalled();
    });

    it('joins the ads table, scopes by user/type and excludes DELETED ads', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: 1 }]);

      await favoritesRepository.countByUserId(userId);

      const sql = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
      expect(sql.strings.join('?')).toContain('"ads"');
      expect(sql.values).toEqual(expect.arrayContaining([userId, 'AD', 'DELETED']));
    });

    it('uses the entity-specific table and excluded status for other types', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: 0 }]);

      await favoritesRepository.countByUserIdAndType(userId, 'STORE');

      const sql = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
      expect(sql.strings.join('?')).toContain('"store_details"');
      expect(sql.values).toEqual(expect.arrayContaining(['STORE', 'BLOCKED']));
    });

    it('returns 0 when the query yields no row', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      expect(await favoritesRepository.countByUserId(userId)).toBe(0);
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
