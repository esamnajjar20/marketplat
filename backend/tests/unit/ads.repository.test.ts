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
        where: { status: AdStatus.ACTIVE },
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
          where: { status: AdStatus.ACTIVE, city: 'Gaza', categoryId: 'cat-1', condition: 'NEW' },
        })
      );
    });

    it('applies minPrice/maxPrice as a combined price range', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({ minPrice: 10, maxPrice: 100 });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: AdStatus.ACTIVE, price: { gte: 10, lte: 100 } },
        })
      );
    });

    it('applies only minPrice when maxPrice is omitted', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.ad.count as jest.Mock).mockResolvedValue(0);

      await adsRepository.findMany({ minPrice: 10 });

      expect(prisma.ad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: AdStatus.ACTIVE, price: { gte: 10 } } })
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

    // FIX SEARCH-AR-01 regression test: guards against a future edit
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

  describe('findRelated', () => {
    it('excludes the current ad and filters by category OR city', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);
      await adsRepository.findRelated(adId, 'cat-1', 'Gaza');
      expect(prisma.ad.findMany).toHaveBeenCalledWith({
        where: {
          id: { not: adId },
          status: AdStatus.ACTIVE,
          OR: [{ categoryId: 'cat-1' }, { city: 'Gaza' }],
        },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 6,
      });
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
