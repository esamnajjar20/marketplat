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

    // FIX SEARCH-AR-01 regression test: guards against a future edit
    // reintroducing a bare to_tsvector(coalesce(...)) column expression
    // (still *correct* — arabic_normalize only normalizes, it doesn't
    // change results for already-normalized input — but it would
    // silently stop matching the ads_search_idx/products_search_idx/
    // store_details_search_idx/service_listings_search_idx GIN indexes'
    // expression, degrading every search to a sequential scan with no
    // functional test failure to catch it).
    //
    // Reads the real Prisma.Sql object's public `.sql` property (every
    // Prisma.Sql instance exposes this — the flattened, parameterized
    // SQL text with $1/$2/... placeholders) rather than trying to
    // introspect the mocked $queryRaw call's tagged-template arguments.
    // @prisma/client itself is NOT mocked in this file (only the
    // `prisma` client singleton is — see the jest.mock at the top), so
    // Prisma.sql/Prisma.join run as real, unmocked code here; `.sql` is
    // documented public API, not an internal implementation detail
    // this test would be gambling on.
    it('wraps every to_tsvector column expression and the search term itself in arabic_normalize(), matching the GIN indexes', async () => {
      let capturedSql = '';
      (prisma.$queryRaw as jest.Mock).mockImplementationOnce((strings: TemplateStringsArray, ...values: unknown[]) => {
        // `unioned` (the UNION ALL of all branches) and `orderBySql`
        // are BOTH interpolated Prisma.Sql objects into this same
        // template — matching on `'UNION ALL'` in the flattened text
        // (rather than just taking the first Prisma.Sql-shaped value)
        // makes this robust to that call's own argument order ever
        // changing, since `unioned` is specifically what carries every
        // branch's arabic_normalize() column expression.
        const unioned = values.find(
          (v): v is { sql: string } =>
            typeof v === 'object' && v !== null && 'sql' in v && (v as { sql: string }).sql.includes('UNION ALL')
        );
        capturedSql = unioned?.sql ?? '';
        return Promise.resolve([]);
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ count: 0n }]);

      await searchRepository.search({ ...baseQuery, q: 'أحمد' });

      // Every branch's column expression (4 branches × title/name +
      // description = 8 occurrences).
      const columnWraps = (capturedSql.match(/to_tsvector\('simple', arabic_normalize\(coalesce\(/g) ?? []).length;
      expect(columnWraps).toBeGreaterThanOrEqual(8);

      // The shared search-term wrap from buildTsQuery.
      expect(capturedSql).toContain("plainto_tsquery('simple', arabic_normalize(");
    });
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
