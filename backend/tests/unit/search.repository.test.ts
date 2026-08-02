import { searchRepository } from '../../src/modules/search/search.repository';
import { prisma } from '../../src/config/prisma';
import type { SearchQuery } from '../../src/modules/search/search.validation';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

const baseQuery: SearchQuery = {
  type: 'all',
  sort: 'relevance',
};

describe('searchRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('search', () => {
    it('issues one rows query and one count query per call (both against the same UNION), and returns them combined', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ id: 'p1', type: 'product' }])
        .mockResolvedValueOnce([{ count: 1n }]);

      const result = await searchRepository.search(baseQuery);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(result.rows).toEqual([{ id: 'p1', type: 'product' }]);
      expect(result.total).toBe(1);
    });

    it('type=all queries all four branches (2 queryRaw calls total, not one per branch)', async () => {
      // Every branch is UNIONed into a single SQL statement, so
      // "4 entities" must still mean exactly 2 $queryRaw calls (rows +
      // count) — one call per branch would mean the UNION strategy
      // silently regressed into N separate round trips.
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }]);

      await searchRepository.search({ ...baseQuery, type: 'all' });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('type=stores with a categoryId short-circuits to an empty result without querying the DB at all', async () => {
      // Stores have no category of their own (see search.repository.ts's
      // storeBranch) — a categoryId filter can never match a store, so
      // this must never reach $queryRaw.
      const result = await searchRepository.search({ ...baseQuery, type: 'stores', categoryId: 'cat-1' });

      expect(result).toEqual({ rows: [], total: 0 });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('defaults total to 0 when the count query returns no rows', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await searchRepository.search(baseQuery);

      expect(result.total).toBe(0);
    });

    it.each(['relevance', 'rating', 'newest', 'views'] as const)(
      'accepts sort=%s without throwing (every SearchSort value has a matching ORDER BY branch)',
      async sort => {
        (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }]);
        await expect(searchRepository.search({ ...baseQuery, sort })).resolves.not.toThrow();
      }
    );
  });

  describe('buildUrl', () => {
    it.each([
      ['ad', 'a1', '/ads/a1'],
      ['product', 'p1', '/products/p1'],
      ['store', 's1', '/stores/s1'],
      ['service', 'sv1', '/services/sv1'],
    ] as const)('maps %s to %s', (type, id, expected) => {
      expect(searchRepository.buildUrl(type, id)).toBe(expected);
    });
  });

  describe('suggest', () => {
    it('queries products, stores, product categories, and service categories in parallel', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ name: 'iPhone 15' }])
        .mockResolvedValueOnce([{ name: 'محل الجوالات' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await searchRepository.suggest('iph');

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
      expect(result).toEqual(['iPhone 15', 'محل الجوالات']);
    });

    it('de-duplicates a name shared across sources while preserving first-seen order', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ name: 'جوالات' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ nameAr: 'جوالات' }])
        .mockResolvedValueOnce([]);

      const result = await searchRepository.suggest('جو');

      expect(result).toEqual(['جوالات']);
    });

    it('caps the merged result to the requested limit even though 4 sources could exceed it', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ name: 'a' }, { name: 'b' }])
        .mockResolvedValueOnce([{ name: 'c' }, { name: 'd' }])
        .mockResolvedValueOnce([{ nameAr: 'e' }])
        .mockResolvedValueOnce([{ nameAr: 'f' }]);

      const result = await searchRepository.suggest('x', 3);

      expect(result).toHaveLength(3);
    });
  });
});
