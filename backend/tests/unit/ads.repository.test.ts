import { adsRepository } from '../../src/modules/ads/ads.repository';
import { prisma } from '../../src/config/prisma';
import { AdStatus } from '@prisma/client';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    ad: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  },
}));

const adId = 'ad-1';
const userId = 'user-1';

describe('adsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates an ad with userId, images, and sellerProfileId merged in', async () => {
      const data = { title: 'Bike', description: 'A nice bike, barely used', city: 'Gaza', isNegotiable: false } as any;
      (prisma.ad.create as jest.Mock).mockResolvedValue({ id: adId });

      await adsRepository.create(userId, data, ['https://example.com/1.jpg'], 'seller-profile-1');

      expect(prisma.ad.create).toHaveBeenCalledWith({
        data: { ...data, userId, images: ['https://example.com/1.jpg'], sellerProfileId: 'seller-profile-1' },
        include: expect.any(Object),
      });
    });
  });

  describe('countActiveByUserId', () => {
    it('counts only ACTIVE ads for the given user', async () => {
      (prisma.ad.count as jest.Mock).mockResolvedValue(3);
      const result = await adsRepository.countActiveByUserId(userId);
      expect(prisma.ad.count).toHaveBeenCalledWith({ where: { userId, status: AdStatus.ACTIVE } });
      expect(result).toBe(3);
    });
  });

  describe('findMany — non-search (ORM) path', () => {
    it('applies default pagination, ACTIVE-only status, and default sort when no filters given', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({});

      expect(prisma.ad.findMany).toHaveBeenCalledWith({
        where: { status: AdStatus.ACTIVE, sellerProfile: { suspended: false } },
        select: expect.any(Object),
        orderBy: [{ isPinned: 'desc' }, { isFeatured: 'desc' }, { createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('applies city (exact match, not contains) and categoryId/condition filters', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({ city: 'Gaza', categoryId: 'cat-1', condition: 'NEW' as any });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: AdStatus.ACTIVE,
            city: 'Gaza',
            categoryId: 'cat-1',
            condition: 'NEW',
            sellerProfile: { suspended: false },
          },
        })
      );
    });

    it('applies minPrice/maxPrice as a combined price range', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({ minPrice: 10, maxPrice: 100 });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: AdStatus.ACTIVE,
            price: { gte: 10, lte: 100 },
            sellerProfile: { suspended: false },
          },
        })
      );
    });

    it('applies only minPrice when maxPrice is omitted', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({ minPrice: 10 });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: AdStatus.ACTIVE, price: { gte: 10 }, sellerProfile: { suspended: false } },
        })
      );
    });

    it('sorts by a custom field/direction when provided', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({ sortBy: 'price', sortOrder: 'asc' });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ isPinned: 'desc' }, { isFeatured: 'desc' }, { price: 'asc' }],
        })
      );
    });

    it('applies custom pagination', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({ page: 3, limit: 10 });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    });

    it('applies isFeatured filter when provided (FIX FEAT-06)', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({ isFeatured: true });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: AdStatus.ACTIVE, isFeatured: true, sellerProfile: { suspended: false } },
        })
      );
    });

    it('omits isFeatured from where when not provided', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({});

      const call = (prisma.ad.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).not.toHaveProperty('isFeatured');
    });

    it('returns ads and total from the parallel queries', async () => {
      const ads = [{ id: 'a1' }, { id: 'a2' }];
      (prisma.ad.findMany as jest.Mock).mockResolvedValue(ads);
      (prisma.ad.count as jest.Mock).mockResolvedValue(2);

      const result = await adsRepository.findMany({});
      expect(result).toEqual({ ads, total: 2 });
    });
  });

  describe('findMany — search (raw SQL) path', () => {
    it('runs the raw full-text-search query and re-hydrates via findMany, preserving rank order', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }])
        .mockResolvedValueOnce([{ count: 2n }]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([
        { id: 'a2', title: 'Second' },
        { id: 'a1', title: 'First' },
      ]);

      const result = await adsRepository.findMany({ search: 'bicycle' });

      expect(result.total).toBe(2);
      // Order follows idRows (search rank), not findMany's return order.
      expect(result.ads.map((a: any) => a.id)).toEqual(['a1', 'a2']);
      expect(prisma.ad.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1', 'a2'] } },
        select: expect.any(Object),
      });
    });

    it('returns an empty result without calling findMany when no rows match the search', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }]);

      const result = await adsRepository.findMany({ search: 'nonexistent' });

      expect(result).toEqual({ ads: [], total: 0 });
      expect(prisma.ad.findMany).not.toHaveBeenCalled();
    });

    it('drops idRows entries that findMany does not return (row deleted between the two queries)', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }])
        .mockResolvedValueOnce([{ count: 2n }]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([{ id: 'a1', title: 'First' }]);

      const result = await adsRepository.findMany({ search: 'bicycle' });

      expect(result.ads.map((a: any) => a.id)).toEqual(['a1']);
      expect(result.total).toBe(2);
    });

    it('defaults total to 0 when the count query returns no rows', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await adsRepository.findMany({ search: 'bicycle' });

      expect(result).toEqual({ ads: [], total: 0 });
    });

    it('takes the search branch (raw SQL) even when other filters are also present', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }]);

      await adsRepository.findMany({ search: 'bicycle', city: 'Gaza', minPrice: 5, maxPrice: 50 });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prisma.ad.count).not.toHaveBeenCalled();
    });

    // regression test: guards against a future edit
    // reintroducing a bare to_tsvector(coalesce(...)) column expression
    // or an un-normalized plainto_tsquery(...) search term — either
    // would still return *correct* results for already-normalized
    // input, but would silently stop matching ads_search_idx's rebuilt
    // GIN expression (degrading to a sequential scan) with no
    // functional test failure to catch it. Reads the real Prisma.Sql
    // object's public `.sql` property, same approach and same
    // reasoning as search.repository.test.ts's equivalent test —
    // @prisma/client is not mocked in this file (only the `prisma`
    // client singleton is), so Prisma.sql/Prisma.join run unmocked.
    it('wraps the tsvector column expression and the search term itself in arabic_normalize(), matching ads_search_idx', async () => {
      let capturedSql = '';
      (prisma.$queryRaw as jest.Mock).mockImplementationOnce((strings: TemplateStringsArray, ...values: unknown[]) => {
        // whereSql is the one Prisma.Sql value here that actually
        // carries the tsvector/tsquery expression — sortColumn (also a
        // Prisma.Sql, via Prisma.raw) never contains 'arabic_normalize',
        // so matching on that substring unambiguously picks out whereSql
        // regardless of the two values' call order.
        const whereSql = values.find(
          (v): v is { sql: string } =>
            typeof v === 'object' && v !== null && 'sql' in v && (v as { sql: string }).sql.includes('arabic_normalize')
        );
        capturedSql = whereSql?.sql ?? '';
        return Promise.resolve([]);
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ count: 0n }]);

      await adsRepository.findMany({ search: 'أحمد' });

      const columnWraps = (capturedSql.match(/to_tsvector\('simple', arabic_normalize\(coalesce\(/g) ?? []).length;
      expect(columnWraps).toBe(2); // title + description

      expect(capturedSql).toContain("plainto_tsquery('simple', arabic_normalize(");
    });

    // AUDIT-FIX (ads-feature review): the search branch previously had
    // no suspended-seller filter at all, unlike the non-search (ORM)
    // branch's documented SEC-FIX — a suspended seller's ads were still
    // fully searchable via GET /ads?search= and GET /ads/search even
    // after suspension. This asserts the raw-SQL WHERE clause now
    // excludes them the same way.
    it('excludes ads from suspended sellers (and legacy ads with no seller profile)', async () => {
      let capturedSql = '';
      (prisma.$queryRaw as jest.Mock).mockImplementationOnce((strings: TemplateStringsArray, ...values: unknown[]) => {
        const whereSql = values.find(
          (v): v is { sql: string } =>
            typeof v === 'object' && v !== null && 'sql' in v && (v as { sql: string }).sql.includes('seller_profiles')
        );
        capturedSql = whereSql?.sql ?? '';
        return Promise.resolve([]);
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ count: 0n }]);

      await adsRepository.findMany({ search: 'bicycle' });

      expect(capturedSql).toContain(
        '"sellerProfileId" IN (SELECT "id" FROM "seller_profiles" WHERE "suspended" = false)'
      );
    });
  });

  describe('findById', () => {
    it('queries by id with full relations included', async () => {
      (prisma.ad.findUnique as jest.Mock).mockResolvedValue(null);
      await adsRepository.findById(adId);
      expect(prisma.ad.findUnique).toHaveBeenCalledWith({ where: { id: adId }, include: expect.any(Object) });
    });
  });

  describe('findManyByUserId', () => {
    it('excludes DELETED ads by default when no statusFilter is given', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findManyByUserId(userId, {});

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, status: { not: AdStatus.DELETED } } })
      );
    });

    it('scopes to a single status when statusFilter is provided (e.g. public profile)', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findManyByUserId(userId, { statusFilter: AdStatus.ACTIVE });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, status: AdStatus.ACTIVE } })
      );
    });

    it('allows DELETED as an explicit statusFilter (self-view only)', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findManyByUserId(userId, { statusFilter: AdStatus.DELETED });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, status: AdStatus.DELETED } })
      );
    });

    it('applies custom pagination', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findManyByUserId(userId, { page: 2, limit: 5 });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }));
    });
  });

  describe('getStatsByUserId (FIX BUG-06/BUG-07)', () => {
    it('runs groupBy and aggregate scoped to the user, excluding DELETED ads', async () => {
      (prisma.ad.groupBy as jest.Mock).mockResolvedValue([
        { status: AdStatus.ACTIVE, _count: { _all: 3 } },
        { status: AdStatus.SOLD, _count: { _all: 1 } },
      ]);
      (prisma.ad.aggregate as jest.Mock).mockResolvedValue({ _sum: { views: 42 } });

      await adsRepository.getStatsByUserId(userId);

      expect(prisma.ad.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { userId, status: { not: AdStatus.DELETED } },
        _count: { _all: true },
      });
      expect(prisma.ad.aggregate).toHaveBeenCalledWith({
        _sum: { views: true },
        where: { userId, status: { not: AdStatus.DELETED } },
      });
    });

    it('maps groupBy rows to activeAds/soldAds by status and reads totalViews from the aggregate sum', async () => {
      (prisma.ad.groupBy as jest.Mock).mockResolvedValue([
        { status: AdStatus.ACTIVE, _count: { _all: 7 } },
        { status: AdStatus.SOLD, _count: { _all: 2 } },
      ]);
      (prisma.ad.aggregate as jest.Mock).mockResolvedValue({ _sum: { views: 150 } });

      const result = await adsRepository.getStatsByUserId(userId);

      expect(result).toEqual({ activeAds: 7, soldAds: 2, totalViews: 150 });
    });

    it('defaults activeAds/soldAds to 0 when groupBy has no row for that status (a seller with only SOLD ads)', async () => {
      (prisma.ad.groupBy as jest.Mock).mockResolvedValue([
        { status: AdStatus.SOLD, _count: { _all: 4 } },
      ]);
      (prisma.ad.aggregate as jest.Mock).mockResolvedValue({ _sum: { views: 20 } });

      const result = await adsRepository.getStatsByUserId(userId);

      expect(result).toEqual({ activeAds: 0, soldAds: 4, totalViews: 20 });
    });

    it('defaults totalViews to 0 when the aggregate sum is null (a user with zero non-deleted ads)', async () => {
      (prisma.ad.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.ad.aggregate as jest.Mock).mockResolvedValue({ _sum: { views: null } });

      const result = await adsRepository.getStatsByUserId(userId);

      expect(result).toEqual({ activeAds: 0, soldAds: 0, totalViews: 0 });
    });

    // regression guard: the entire point of this method
    // is that it's a real aggregate with no page-size ceiling — a seller
    // with hundreds of ads must produce an accurate count exactly like a
    // seller with a handful, since groupBy/aggregate never LIMIT/OFFSET.
    it('is not affected by ad counts far beyond the old 100-item stats page-size cap', async () => {
      (prisma.ad.groupBy as jest.Mock).mockResolvedValue([
        { status: AdStatus.ACTIVE, _count: { _all: 430 } },
        { status: AdStatus.SOLD, _count: { _all: 215 } },
      ]);
      (prisma.ad.aggregate as jest.Mock).mockResolvedValue({ _sum: { views: 98_000 } });

      const result = await adsRepository.getStatsByUserId(userId);

      expect(result).toEqual({ activeAds: 430, soldAds: 215, totalViews: 98_000 });
    });
  });

  describe('findRelated', () => {
    it('excludes the current ad and filters by category OR city', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      await adsRepository.findRelated(adId, 'cat-1', 'Gaza');
      expect(prisma.ad.findMany).toHaveBeenCalledWith({
        where: {
          id: { not: adId },
          status: AdStatus.ACTIVE,
          sellerProfile: { suspended: false },
          OR: [{ categoryId: 'cat-1' }, { city: 'Gaza' }],
        },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 6,
      });
    });

    // AUDIT-FIX (ads-feature review): findRelated previously had no
    // suspended-seller filter at all — a suspended seller's ads could
    // still be recommended in the "related ads" section of every other
    // ad matching its category/city, even after the seller was
    // suspended. Same filter as findMany's non-search branch.
    it('excludes ads from suspended sellers', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      await adsRepository.findRelated(adId, 'cat-1', 'Gaza');
      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sellerProfile: { suspended: false } }),
        })
      );
    });

    it('omits the categoryId OR-branch when categoryId is null', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      await adsRepository.findRelated(adId, null, 'Gaza');
      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: [{ city: 'Gaza' }] }) })
      );
    });

    it('respects a custom limit', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      await adsRepository.findRelated(adId, 'cat-1', 'Gaza', 3);
      expect(prisma.ad.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    });
  });

  describe('update', () => {
    it('updates with the given partial data', async () => {
      (prisma.ad.update as jest.Mock).mockResolvedValue({ id: adId });
      await adsRepository.update(adId, { title: 'New title' } as any);
      expect(prisma.ad.update).toHaveBeenCalledWith({
        where: { id: adId },
        data: { title: 'New title' },
        include: expect.any(Object),
      });
    });
  });

  describe('addImages', () => {
    it('runs the raw array-merge update then re-fetches the ad', async () => {
      (prisma.$executeRawUnsafe as jest.Mock).mockResolvedValue(undefined);
      (prisma.ad.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: adId });

      const result = await adsRepository.addImages(adId, ['https://example.com/new.jpg']);

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "ads"'),
        adId,
        'https://example.com/new.jpg'
      );
      expect(prisma.ad.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: adId },
        include: expect.any(Object),
      });
      expect(result).toEqual({ id: adId });
    });

    it('passes a custom maxImages cap into the raw SQL', async () => {
      (prisma.$executeRawUnsafe as jest.Mock).mockResolvedValue(undefined);
      (prisma.ad.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: adId });

      await adsRepository.addImages(adId, ['https://example.com/new.jpg'], 5);

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('LIMIT 5'), adId, 'https://example.com/new.jpg');
    });
  });

  describe('removeImage', () => {
    it('runs the raw array_remove update then re-fetches the ad', async () => {
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(undefined);
      (prisma.ad.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: adId });

      const result = await adsRepository.removeImage(adId, 'https://example.com/old.jpg');

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.ad.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: adId },
        include: expect.any(Object),
      });
      expect(result).toEqual({ id: adId });
    });
  });

  describe('incrementViews', () => {
    it('atomically increments the views counter', async () => {
      (prisma.ad.update as jest.Mock).mockResolvedValue({ id: adId });
      await adsRepository.incrementViews(adId);
      expect(prisma.ad.update).toHaveBeenCalledWith({
        where: { id: adId },
        data: { views: { increment: 1 } },
      });
    });
  });

  describe('softDelete', () => {
    it('sets status to DELETED', async () => {
      (prisma.ad.update as jest.Mock).mockResolvedValue({ id: adId });
      await adsRepository.softDelete(adId);
      expect(prisma.ad.update).toHaveBeenCalledWith({
        where: { id: adId },
        data: { status: AdStatus.DELETED },
      });
    });
  });
});
