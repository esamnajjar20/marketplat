import { searchFacetsRepository } from '../../src/modules/search/search.facets.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    ad: {
      groupBy: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const baseQuery = { type: 'all' as const, radius: 10 };

describe('searchFacetsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('price ranges respect the same WHERE q filter as the main search', () => {
    it('applies the q OR filter to every price-bucket count call', async () => {
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);
      (prisma.ad.groupBy as jest.Mock).mockResolvedValue([]);

      await searchFacetsRepository.facets({ ...baseQuery, q: 'iPhone' });

      const countCalls = (prisma.ad.count as jest.Mock).mock.calls;
      // At least one count call targets a price bucket (has `price` in where).
      const priceCall = countCalls.find(([where]) => Boolean(where && where.price));
      expect(priceCall).toBeDefined();
      expect(priceCall![0].OR).toEqual([
        { title: { contains: 'iPhone', mode: 'insensitive' } },
        { description: { contains: 'iPhone', mode: 'insensitive' } },
      ]);
      // Every price-bucket count call carries the q filter.
      countCalls.forEach(([where]) => {
        if (where && where.price) {
          expect(where.OR).toEqual([
            { title: { contains: 'iPhone', mode: 'insensitive' } },
            { description: { contains: 'iPhone', mode: 'insensitive' } },
          ]);
        }
      });
    });

    it('does not add a q OR filter when q is absent', async () => {
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);
      (prisma.ad.groupBy as jest.Mock).mockResolvedValue([]);

      await searchFacetsRepository.facets({ ...baseQuery });

      const countCalls = (prisma.ad.count as jest.Mock).mock.calls;
      countCalls.forEach(([where]) => {
        if (where && where.price) {
          expect(where.OR).toBeUndefined();
        }
      });
    });
  });
});
