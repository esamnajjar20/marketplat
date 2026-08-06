import { recommendationsRepository } from '../../src/modules/recommendations/recommendations.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    favorite: { findMany: jest.fn() },
    ad: { findMany: jest.fn() },
    userActivity: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

describe('recommendationsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('favoritedCategoryIds', () => {
    it('excludes deleted ads and null categories at the query level', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);

      await recommendationsRepository.favoritedCategoryIds('user-1');

      expect(prisma.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', ad: { status: { not: 'DELETED' }, categoryId: { not: null } } },
        select: { ad: { select: { categoryId: true } } },
      });
    });

    it('flattens rows into a plain category id array', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
        { ad: { categoryId: 'cat-1' } },
        { ad: { categoryId: 'cat-2' } },
      ]);

      const result = await recommendationsRepository.favoritedCategoryIds('user-1');
      expect(result).toEqual(['cat-1', 'cat-2']);
    });
  });

  describe('createdAdCategoryIds', () => {
    it('returns [] without a second query when the user created no ads', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([]);

      const result = await recommendationsRepository.createdAdCategoryIds('user-1');

      expect(result).toEqual([]);
      expect(prisma.ad.findMany).not.toHaveBeenCalled();
    });

    it('resolves entityId → categoryId via a follow-up ad lookup', async () => {
      (prisma.userActivity.findMany as jest.Mock).mockResolvedValue([
        { entityId: 'ad-1' },
        { entityId: 'ad-2' },
      ]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1' },
        { categoryId: 'cat-2' },
      ]);

      const result = await recommendationsRepository.createdAdCategoryIds('user-1');

      expect(prisma.ad.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['ad-1', 'ad-2'] }, categoryId: { not: null } },
        select: { categoryId: true },
      });
      expect(result).toEqual(['cat-1', 'cat-2']);
    });
  });

  describe('excludedAdIds', () => {
    it('combines owned and favorited ad ids', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([{ id: 'owned-1' }]);
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([{ adId: 'fav-1' }]);

      const result = await recommendationsRepository.excludedAdIds('user-1');
      expect(result).toEqual(['owned-1', 'fav-1']);
    });
  });

  describe('findByWeightedCategories', () => {
    it('returns [] without querying when no category weights are given', async () => {
      const result = await recommendationsRepository.findByWeightedCategories([], [], 8);

      expect(result).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('preserves the ranked order returned by the raw query, dropping rows since deleted', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'ad-2' }, { id: 'ad-1' }]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([
        { id: 'ad-1', title: 'A' },
        // ad-2 intentionally absent — simulates a row deleted between
        // the raw id query and the follow-up findMany.
      ]);

      const result = await recommendationsRepository.findByWeightedCategories(
        [{ categoryId: 'cat-1', weight: 3 }],
        [],
        8
      );

      expect(result).toEqual([{ id: 'ad-1', title: 'A' }]);
    });
  });

  describe('findTrending', () => {
    it('omits the id filter entirely when there is nothing to exclude', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);

      await recommendationsRepository.findTrending([], 8);

      const callArg = (prisma.ad.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.where).toEqual({ status: 'ACTIVE' });
    });

    it('applies a notIn filter when exclusions are given', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);

      await recommendationsRepository.findTrending(['ad-1'], 8);

      const callArg = (prisma.ad.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.where).toEqual({ status: 'ACTIVE', id: { notIn: ['ad-1'] } });
    });
  });
});
