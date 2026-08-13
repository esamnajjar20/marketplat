import { favoritesRepository } from '../../src/modules/favorites/favorites.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    favorite: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const userId = 'user-1';
const adId = 'ad-1';

describe('favoritesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findManyByUserId', () => {
    // FIX FAV-01 regression coverage: this filter is the actual fix —
    // a favorited ad that's since been soft-deleted (status: DELETED)
    // must never appear in, or count toward the total of, "المفضلة".
    it('excludes ads with status DELETED at the query level', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.favorite.count as jest.Mock).mockResolvedValue(0);

      await favoritesRepository.findManyByUserId(userId, {});

      const expectedWhere = { userId, ad: { status: { not: 'DELETED' } } };
      expect(prisma.favorite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere })
      );
      expect(prisma.favorite.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('applies the same where clause (with the status filter) to both the findMany and count calls', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.favorite.count as jest.Mock).mockResolvedValue(0);

      await favoritesRepository.findManyByUserId(userId, {});

      const findManyWhere = (prisma.favorite.findMany as jest.Mock).mock.calls[0][0].where;
      const countWhere = (prisma.favorite.count as jest.Mock).mock.calls[0][0].where;
      expect(findManyWhere).toEqual(countWhere);
    });

    it('applies pagination skip/take from page and limit', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.favorite.count as jest.Mock).mockResolvedValue(0);

      await favoritesRepository.findManyByUserId(userId, { page: 3, limit: 10 });

      expect(prisma.favorite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    it('returns the favorites and total from the parallel queries', async () => {
      const favorites = [{ id: 'fav-1' }, { id: 'fav-2' }];
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue(favorites);
      (prisma.favorite.count as jest.Mock).mockResolvedValue(2);

      const result = await favoritesRepository.findManyByUserId(userId, {});

      expect(result).toEqual({ favorites, total: 2 });
    });
  });

  describe('countByUserId (FIX BUG-07)', () => {
    it('counts favorites for the user, excluding ads with status DELETED (same filter as findManyByUserId)', async () => {
      (prisma.favorite.count as jest.Mock).mockResolvedValue(9);

      const result = await favoritesRepository.countByUserId(userId);

      expect(prisma.favorite.count).toHaveBeenCalledWith({
        where: { userId, ad: { status: { not: 'DELETED' } } },
      });
      expect(result).toBe(9);
    });

    // FIX BUG-07 regression guard: the whole point of this method is
    // that it has no page to outgrow — count() has no skip/take, so it
    // stays accurate however many favorites the user has.
    it('is not affected by favorite counts far beyond the old 100-item stats page-size cap', async () => {
      (prisma.favorite.count as jest.Mock).mockResolvedValue(640);

      const result = await favoritesRepository.countByUserId(userId);

      expect(result).toBe(640);
    });
  });

  describe('findUserIdsByAdId', () => {
    it('queries favorites for the ad and returns just the userIds', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);

      const result = await favoritesRepository.findUserIdsByAdId(adId);

      expect(prisma.favorite.findMany).toHaveBeenCalledWith({
        where: { adId },
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
});
