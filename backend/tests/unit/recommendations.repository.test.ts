import {
  recommendationsRepository,
  productRecommendationsRepository,
  serviceListingRecommendationsRepository,
  storeRecommendationsRepository,
} from '../../src/modules/recommendations/recommendations.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => {
  const prismaMock = {
    favorite: { findMany: jest.fn() },
    ad: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    serviceListing: { findMany: jest.fn() },
    userActivity: { findMany: jest.fn() },
    storeFollower: { findMany: jest.fn() },
    storeDetails: { findFirst: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };

  return {
    prisma: {
      ...prismaMock,
      $transaction: jest.fn(async (callback) => callback(prismaMock)),
    },
  };
});

describe('recommendationsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  // FEAT-FAVORITE-POLYMORPHIC PR1: Favorite has no relation to Ad
  // anymore, so this is now a two-step fan-out (favorite entityIds,
  // then a follow-up ad lookup) instead of one Prisma call with
  // include/where through `ad:` — see recommendations.repository.ts's
  // own comment on favoritedCategoryIds.
  describe('favoritedCategoryIds', () => {
    it('returns [] without a second query when the user has no AD favorites', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);

      const result = await recommendationsRepository.favoritedCategoryIds('user-1');

      expect(prisma.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', entityType: 'AD' },
        select: { entityId: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      expect(result).toEqual([]);
      expect(prisma.ad.findMany).not.toHaveBeenCalled();
    });

    it('excludes deleted ads and null categories on the follow-up ad lookup', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
        { entityId: 'ad-1' },
        { entityId: 'ad-2' },
      ]);
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1' },
        { categoryId: 'cat-2' },
      ]);

      const result = await recommendationsRepository.favoritedCategoryIds('user-1');

      expect(prisma.ad.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['ad-1', 'ad-2'] },
          status: { not: 'DELETED' },
          categoryId: { not: null },
        },
        select: { categoryId: true },
      });
      expect(result).toEqual(['cat-1', 'cat-2']);
    });
  });

  describe('getAdCategoryInterest', () => {
    it('returns [] when there are no behavioral, created, or favorite signals', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await recommendationsRepository.getAdCategoryInterest('user-1');

      expect(result).toEqual([]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it('aggregates behavioral, created, and favorite category signals', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          {
            categoryId: 'cat-view',
            signalWeight: 1,
            createdAt: new Date(),
          },
          {
            categoryId: 'cat-search',
            signalWeight: 4,
            createdAt: new Date(),
          },
        ])
        .mockResolvedValueOnce([
          {
            categoryId: 'cat-created',
            signalWeight: 2,
            createdAt: new Date(),
            applyDecay: false,
          },
        ])
        .mockResolvedValueOnce([
          {
            categoryId: 'cat-favorite',
            signalWeight: 6,
            createdAt: new Date(),
            applyDecay: false,
          },
        ]);

      const result = await recommendationsRepository.getAdCategoryInterest('user-1');

      expect(result).toEqual([
        { categoryId: 'cat-favorite', score: 6 },
        { categoryId: 'cat-search', score: 4 },
        { categoryId: 'cat-created', score: 2 },
        { categoryId: 'cat-view', score: 1 },
      ]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it('sums repeated signals for the same category', async () => {
      const now = new Date();

      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          {
            categoryId: 'cat-1',
            signalWeight: 1,
            createdAt: now,
          },
          {
            categoryId: 'cat-1',
            signalWeight: 4,
            createdAt: now,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            categoryId: 'cat-1',
            signalWeight: 6,
            createdAt: now,
            applyDecay: false,
          },
        ]);

      const result = await recommendationsRepository.getAdCategoryInterest('user-1');

      expect(result).toEqual([
        { categoryId: 'cat-1', score: 11 },
      ]);
    });
  });

  describe('excludedAdIds', () => {
    it('combines owned and favorited ad ids', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([{ id: 'owned-1' }]);
      // FEAT-FAVORITE-POLYMORPHIC PR1: reads entityId (scoped to
      // entityType: 'AD'), not adId.
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([{ entityId: 'fav-1' }]);

      const result = await recommendationsRepository.excludedAdIds('user-1');

      expect(prisma.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', entityType: 'AD' },
        select: { entityId: true },
      });
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
      expect(callArg.where).toEqual({ status: 'ACTIVE', sellerProfile: { suspended: false } });
    });

    it('applies a notIn filter when exclusions are given', async () => {
      (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);

      await recommendationsRepository.findTrending(['ad-1'], 8);

      const callArg = (prisma.ad.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.where).toEqual({
        status: 'ACTIVE',
        sellerProfile: { suspended: false },
        id: { notIn: ['ad-1'] },
      });
    });

    // PR5B: findTrending now issues two bounded prisma.ad.findMany
    // calls (topByViews, then mostRecent — see recommendations
    // .repository.ts's own comment) instead of one views-sorted page,
    // then re-ranks the merged pool by a bounded composite score. The
    // two tests above already confirm the FIRST call's `where` is
    // unchanged; these confirm the second call happens too, and that
    // the merge/re-rank/dedup/limit behavior is correct.
    describe('PR5B bounded composite ranking', () => {
      const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
      const fakeAd = (over: Partial<{
        id: string; views: number; createdAt: Date; isPinned: boolean; isFeatured: boolean;
      }>) => ({
        id: 'ad-x', views: 0, createdAt: new Date(), isPinned: false, isFeatured: false, ...over,
      });

      it('issues a second findMany call (mostRecent pool) alongside the first (topByViews)', async () => {
        (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);

        await recommendationsRepository.findTrending([], 8);

        expect(prisma.ad.findMany).toHaveBeenCalledTimes(2);
      });

      it('lets a brand-new, zero-view ad become a real trending candidate', async () => {
        // Old behavior: a pure `views DESC` page could NEVER surface a
        // views=0 ad once `limit` other ads had at least one view each
        // — it was permanently unreachable, not just usually outranked.
        // topByViews here deliberately contains no zero-view ad at all
        // (simulating that exact old-code blind spot); mostRecent is
        // where the new ad is discoverable instead.
        const oldPopular = fakeAd({ id: 'old-popular', views: 3, createdAt: daysAgo(200) });
        const brandNew = fakeAd({ id: 'brand-new', views: 0, createdAt: daysAgo(0) });
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce([oldPopular])
          .mockResolvedValueOnce([brandNew]);

        const result = await recommendationsRepository.findTrending([], 8);

        expect(result.map(a => a.id)).toEqual(expect.arrayContaining(['brand-new']));
      });

      it('does not let a zero-view brand-new ad automatically outrank a genuinely popular one', async () => {
        // PR5B explicitly asked for starvation removed, not for a
        // zero-view item to auto-top everything — a very popular,
        // still-reasonably-fresh ad should keep winning.
        const veryPopular = fakeAd({ id: 'very-popular', views: 500, createdAt: daysAgo(10) });
        const brandNew = fakeAd({ id: 'brand-new', views: 0, createdAt: daysAgo(0) });
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce([veryPopular])
          .mockResolvedValueOnce([brandNew]);

        const result = await recommendationsRepository.findTrending([], 1);

        expect(result.map(a => a.id)).toEqual(['very-popular']);
      });

      it('keeps isPinned/isFeatured as hard priority tiers above the composite score', async () => {
        // A pinned ad with far fewer views/older than an unpinned one
        // must still sort first — PR5B never touches this semantics.
        const pinned = fakeAd({ id: 'pinned-ad', views: 1, createdAt: daysAgo(300), isPinned: true });
        const unpinnedPopular = fakeAd({ id: 'unpinned-popular', views: 9999, createdAt: daysAgo(0) });
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce([pinned, unpinnedPopular])
          .mockResolvedValueOnce([]);

        const result = await recommendationsRepository.findTrending([], 2);

        expect(result.map(a => a.id)).toEqual(['pinned-ad', 'unpinned-popular']);
      });

      it('deduplicates an ad that appears in both pools', async () => {
        const sameAd = fakeAd({ id: 'in-both-pools', views: 5, createdAt: daysAgo(1) });
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce([sameAd])
          .mockResolvedValueOnce([sameAd]);

        const result = await recommendationsRepository.findTrending([], 8);

        expect(result.map(a => a.id)).toEqual(['in-both-pools']);
      });

      it('respects the requested limit after merging both pools', async () => {
        const ads = [1, 2, 3, 4].map(n => fakeAd({ id: `ad-${n}`, views: n, createdAt: daysAgo(n) }));
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce(ads)
          .mockResolvedValueOnce([]);

        const result = await recommendationsRepository.findTrending([], 2);

        expect(result).toHaveLength(2);
      });

      it('produces the same order on repeated calls with the same input (deterministic)', async () => {
        const ads = [1, 2, 3].map(n => fakeAd({ id: `ad-${n}`, views: n, createdAt: daysAgo(n * 10) }));
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValue(ads.slice())
          .mockResolvedValueOnce(ads.slice())
          .mockResolvedValueOnce([]);

        const first = await recommendationsRepository.findTrending([], 8);

        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce(ads.slice())
          .mockResolvedValueOnce([]);
        const second = await recommendationsRepository.findTrending([], 8);

        expect(second.map(a => a.id)).toEqual(first.map(a => a.id));
      });

      it('breaks a full tie (equal score, equal createdAt) deterministically by id ASC', async () => {
        const sameTimestamp = daysAgo(5);
        const tiedB = fakeAd({ id: 'ad-b', views: 5, createdAt: sameTimestamp });
        const tiedA = fakeAd({ id: 'ad-a', views: 5, createdAt: sameTimestamp });
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce([tiedB, tiedA])
          .mockResolvedValueOnce([]);

        const result = await recommendationsRepository.findTrending([], 2);

        expect(result.map(a => a.id)).toEqual(['ad-a', 'ad-b']);
      });

      // PR5D: explicit AD coverage for the remaining checklist items —
      // recent-low-view, cold-start, limit=1/limit=24, and exclusions
      // reaching BOTH pool queries (not just the first). These were
      // previously covered only implicitly through the more general
      // tests above; PR5D asked for them named and direct instead of
      // assumed.
      it('includes a recent item with a low, non-zero view count as a real candidate', async () => {
        const recentLowView = fakeAd({ id: 'recent-low-view', views: 2, createdAt: daysAgo(1) });
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([recentLowView]);

        const result = await recommendationsRepository.findTrending([], 8);

        expect(result.map(a => a.id)).toContain('recent-low-view');
      });

      it('returns an empty array when both candidate pools are empty (cold start)', async () => {
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        const result = await recommendationsRepository.findTrending([], 8);

        expect(result).toEqual([]);
      });

      it('respects limit=1, returning exactly the single top-ranked candidate', async () => {
        const ads = [1, 2, 3].map(n => fakeAd({ id: `ad-${n}`, views: n * 10, createdAt: daysAgo(n) }));
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce(ads)
          .mockResolvedValueOnce([]);

        const result = await recommendationsRepository.findTrending([], 1);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('ad-3');
      });

      it('respects limit=24 (the maximum allowed) when more than 24 candidates exist across both pools', async () => {
        const topByViews = Array.from({ length: 20 }, (_, i) =>
          fakeAd({ id: `views-${i}`, views: 100 - i, createdAt: daysAgo(50) }));
        const mostRecent = Array.from({ length: 20 }, (_, i) =>
          fakeAd({ id: `recent-${i}`, views: 0, createdAt: daysAgo(i) }));
        (prisma.ad.findMany as jest.Mock)
          .mockResolvedValueOnce(topByViews)
          .mockResolvedValueOnce(mostRecent);

        const result = await recommendationsRepository.findTrending([], 24);

        expect(result).toHaveLength(24);
        // No duplicate ids in the final merged/ranked result.
        expect(new Set(result.map(a => a.id)).size).toBe(24);
      });

      it('passes the same exclusion where-clause to both the topByViews and mostRecent calls', async () => {
        (prisma.ad.findMany as jest.Mock).mockResolvedValue([]);

        await recommendationsRepository.findTrending(['ad-owned', 'ad-favorited'], 8);

        const firstCallWhere = (prisma.ad.findMany as jest.Mock).mock.calls[0][0].where;
        const secondCallWhere = (prisma.ad.findMany as jest.Mock).mock.calls[1][0].where;
        expect(firstCallWhere).toEqual({
          status: 'ACTIVE',
          sellerProfile: { suspended: false },
          id: { notIn: ['ad-owned', 'ad-favorited'] },
        });
        expect(secondCallWhere).toEqual(firstCallWhere);
      });
    });
  });
});

// PR4A (recommendation view signals): productRecommendationsRepository
// and serviceListingRecommendationsRepository's own recentlyViewedCategoryIds —
// the PRODUCT_VIEW/SERVICE_VIEW counterpart of
// recommendationsRepository.recentlyViewedCategoryIds (AD) covered
// implicitly above via findByWeightedCategories/findTrending. These
// read AnalyticsEvent via $queryRaw, same as the AD version, so the
// coverage here mirrors that file's own raw-query test shape.
describe('productRecommendationsRepository.recentlyViewedCategoryIds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries AnalyticsEvent joined on products, filtered to the PRODUCT_VIEW event and this user', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { categoryId: 'cat-1' },
      { categoryId: 'cat-2' },
    ]);

    const result = await productRecommendationsRepository.recentlyViewedCategoryIds('user-1');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    // Tagged-call: [stringsArray, ...interpolatedValues] — the
    // interpolated values include userId and AnalyticsEventType.PRODUCT_VIEW,
    // confirming this reads the new event type and not AD_VIEW's.
    const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
    expect(callArgs).toContain('user-1');
    expect(callArgs).toContain('PRODUCT_VIEW');
    expect(result).toEqual(['cat-1', 'cat-2']);
  });

  it('drops rows with a null categoryId (product deleted between event and query)', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { categoryId: 'cat-1' },
      { categoryId: null },
    ]);

    const result = await productRecommendationsRepository.recentlyViewedCategoryIds('user-1');

    expect(result).toEqual(['cat-1']);
  });

  it('returns [] when the user has no PRODUCT_VIEW events', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    const result = await productRecommendationsRepository.recentlyViewedCategoryIds('user-1');

    expect(result).toEqual([]);
  });
});

describe('serviceListingRecommendationsRepository.recentlyViewedCategoryIds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries AnalyticsEvent joined on service_listings, filtered to the SERVICE_VIEW event and this user', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ categoryId: 'cat-3' }]);

    const result = await serviceListingRecommendationsRepository.recentlyViewedCategoryIds('user-1');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
    expect(callArgs).toContain('user-1');
    expect(callArgs).toContain('SERVICE_VIEW');
    expect(result).toEqual(['cat-3']);
  });

  it('drops rows with a null categoryId', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { categoryId: 'cat-1' },
      { categoryId: null },
    ]);

    const result = await serviceListingRecommendationsRepository.recentlyViewedCategoryIds('user-1');

    expect(result).toEqual(['cat-1']);
  });

  it('returns [] when the user has no SERVICE_VIEW events', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    const result = await serviceListingRecommendationsRepository.recentlyViewedCategoryIds('user-1');

    expect(result).toEqual([]);
  });
});

// PR5B: productRecommendationsRepository/serviceListingRecommendationsRepository
// findTrending — same two-pool bounded-composite-score mechanism as
// recommendationsRepository.findTrending above (AD), just without an
// isPinned/isFeatured tier (neither field exists on Product or
// ServiceListing — confirmed against schema.prisma).
describe('productRecommendationsRepository.findTrending', () => {
  beforeEach(() => jest.clearAllMocks());
  const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const fakeProduct = (over: Partial<{ id: string; views: number; createdAt: Date }>) => ({
    id: 'product-x', views: 0, createdAt: new Date(), ...over,
  });

  it('issues two findMany calls (topByViews, mostRecent)', async () => {
    (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

    await productRecommendationsRepository.findTrending([], 8);

    expect(prisma.product.findMany).toHaveBeenCalledTimes(2);
  });

  it('lets a brand-new, zero-view product become a real trending candidate', async () => {
    const oldPopular = fakeProduct({ id: 'old-popular', views: 3, createdAt: daysAgo(200) });
    const brandNew = fakeProduct({ id: 'brand-new', views: 0, createdAt: daysAgo(0) });
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce([oldPopular])
      .mockResolvedValueOnce([brandNew]);

    const result = await productRecommendationsRepository.findTrending([], 8);

    expect(result.map(p => p.id)).toEqual(expect.arrayContaining(['brand-new']));
  });

  it('does not let a zero-view brand-new product automatically outrank a very popular one', async () => {
    const veryPopular = fakeProduct({ id: 'very-popular', views: 500, createdAt: daysAgo(10) });
    const brandNew = fakeProduct({ id: 'brand-new', views: 0, createdAt: daysAgo(0) });
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce([veryPopular])
      .mockResolvedValueOnce([brandNew]);

    const result = await productRecommendationsRepository.findTrending([], 1);

    expect(result.map(p => p.id)).toEqual(['very-popular']);
  });

  it('deduplicates a product appearing in both pools', async () => {
    const sameProduct = fakeProduct({ id: 'in-both-pools', views: 5, createdAt: daysAgo(1) });
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce([sameProduct])
      .mockResolvedValueOnce([sameProduct]);

    const result = await productRecommendationsRepository.findTrending([], 8);

    expect(result.map(p => p.id)).toEqual(['in-both-pools']);
  });

  it('respects the requested limit after merging both pools', async () => {
    const products = [1, 2, 3, 4].map(n => fakeProduct({ id: `p-${n}`, views: n, createdAt: daysAgo(n) }));
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce(products)
      .mockResolvedValueOnce([]);

    const result = await productRecommendationsRepository.findTrending([], 2);

    expect(result).toHaveLength(2);
  });

  // PR5D: same checklist coverage AD's PR5B block now has, mirrored
  // here instead of relying on rankTrendingCandidates being shared —
  // per this task's own instruction not to leave PRODUCT's coverage
  // implicit-only.
  it('omits the id filter when there is nothing to exclude', async () => {
    (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

    await productRecommendationsRepository.findTrending([], 8);

    const callArg = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where).toEqual({ status: 'ACTIVE', store: { sellerProfile: { suspended: false } } });
  });

  it('applies a notIn filter to both pool queries when exclusions are given', async () => {
    (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

    await productRecommendationsRepository.findTrending(['product-owned'], 8);

    const firstCallWhere = (prisma.product.findMany as jest.Mock).mock.calls[0][0].where;
    const secondCallWhere = (prisma.product.findMany as jest.Mock).mock.calls[1][0].where;
    expect(firstCallWhere).toEqual({
      status: 'ACTIVE',
      store: { sellerProfile: { suspended: false } },
      id: { notIn: ['product-owned'] },
    });
    expect(secondCallWhere).toEqual(firstCallWhere);
  });

  it('includes a recent item with a low, non-zero view count as a real candidate', async () => {
    const recentLowView = fakeProduct({ id: 'recent-low-view', views: 2, createdAt: daysAgo(1) });
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([recentLowView]);

    const result = await productRecommendationsRepository.findTrending([], 8);

    expect(result.map(p => p.id)).toContain('recent-low-view');
  });

  it('returns an empty array when both candidate pools are empty (cold start)', async () => {
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await productRecommendationsRepository.findTrending([], 8);

    expect(result).toEqual([]);
  });

  it('produces the same order on repeated calls with the same input (deterministic)', async () => {
    const products = [1, 2, 3].map(n => fakeProduct({ id: `p-${n}`, views: n, createdAt: daysAgo(n * 10) }));
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce(products.slice())
      .mockResolvedValueOnce([]);
    const first = await productRecommendationsRepository.findTrending([], 8);

    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce(products.slice())
      .mockResolvedValueOnce([]);
    const second = await productRecommendationsRepository.findTrending([], 8);

    expect(second.map(p => p.id)).toEqual(first.map(p => p.id));
  });

  it('breaks a full tie (equal score, equal createdAt) deterministically by id ASC', async () => {
    const sameTimestamp = daysAgo(5);
    const tiedB = fakeProduct({ id: 'p-b', views: 5, createdAt: sameTimestamp });
    const tiedA = fakeProduct({ id: 'p-a', views: 5, createdAt: sameTimestamp });
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce([tiedB, tiedA])
      .mockResolvedValueOnce([]);

    const result = await productRecommendationsRepository.findTrending([], 2);

    expect(result.map(p => p.id)).toEqual(['p-a', 'p-b']);
  });

  it('respects limit=1, returning exactly the single top-ranked candidate', async () => {
    const products = [1, 2, 3].map(n => fakeProduct({ id: `p-${n}`, views: n * 10, createdAt: daysAgo(n) }));
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce(products)
      .mockResolvedValueOnce([]);

    const result = await productRecommendationsRepository.findTrending([], 1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p-3');
  });

  it('respects limit=24 (the maximum allowed) when more than 24 candidates exist across both pools', async () => {
    const topByViews = Array.from({ length: 20 }, (_, i) =>
      fakeProduct({ id: `views-${i}`, views: 100 - i, createdAt: daysAgo(50) }));
    const mostRecent = Array.from({ length: 20 }, (_, i) =>
      fakeProduct({ id: `recent-${i}`, views: 0, createdAt: daysAgo(i) }));
    (prisma.product.findMany as jest.Mock)
      .mockResolvedValueOnce(topByViews)
      .mockResolvedValueOnce(mostRecent);

    const result = await productRecommendationsRepository.findTrending([], 24);

    expect(result).toHaveLength(24);
    expect(new Set(result.map(p => p.id)).size).toBe(24);
  });
});

describe('serviceListingRecommendationsRepository.findTrending', () => {
  beforeEach(() => jest.clearAllMocks());
  const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const fakeListing = (over: Partial<{ id: string; views: number; createdAt: Date }>) => ({
    id: 'listing-x', views: 0, createdAt: new Date(), ...over,
  });

  it('issues two findMany calls (topByViews, mostRecent)', async () => {
    (prisma.serviceListing.findMany as jest.Mock).mockResolvedValue([]);

    await serviceListingRecommendationsRepository.findTrending([], 8);

    expect(prisma.serviceListing.findMany).toHaveBeenCalledTimes(2);
  });

  it('lets a brand-new, zero-view listing become a real trending candidate', async () => {
    const oldPopular = fakeListing({ id: 'old-popular', views: 3, createdAt: daysAgo(200) });
    const brandNew = fakeListing({ id: 'brand-new', views: 0, createdAt: daysAgo(0) });
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce([oldPopular])
      .mockResolvedValueOnce([brandNew]);

    const result = await serviceListingRecommendationsRepository.findTrending([], 8);

    expect(result.map(l => l.id)).toEqual(expect.arrayContaining(['brand-new']));
  });

  it('deduplicates a listing appearing in both pools', async () => {
    const sameListing = fakeListing({ id: 'in-both-pools', views: 5, createdAt: daysAgo(1) });
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce([sameListing])
      .mockResolvedValueOnce([sameListing]);

    const result = await serviceListingRecommendationsRepository.findTrending([], 8);

    expect(result.map(l => l.id)).toEqual(['in-both-pools']);
  });

  it('respects the requested limit after merging both pools', async () => {
    const listings = [1, 2, 3, 4].map(n => fakeListing({ id: `l-${n}`, views: n, createdAt: daysAgo(n) }));
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce(listings)
      .mockResolvedValueOnce([]);

    const result = await serviceListingRecommendationsRepository.findTrending([], 2);

    expect(result).toHaveLength(2);
  });

  // PR5D: same checklist coverage as AD/PRODUCT above, including the
  // popular-old-item case this entity was missing entirely.
  it('omits the id filter when there is nothing to exclude', async () => {
    (prisma.serviceListing.findMany as jest.Mock).mockResolvedValue([]);

    await serviceListingRecommendationsRepository.findTrending([], 8);

    const callArg = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where).toEqual({ status: 'ACTIVE', provider: { sellerProfile: { suspended: false } } });
  });

  it('applies a notIn filter to both pool queries when exclusions are given', async () => {
    (prisma.serviceListing.findMany as jest.Mock).mockResolvedValue([]);

    await serviceListingRecommendationsRepository.findTrending(['listing-owned'], 8);

    const firstCallWhere = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0].where;
    const secondCallWhere = (prisma.serviceListing.findMany as jest.Mock).mock.calls[1][0].where;
    expect(firstCallWhere).toEqual({
      status: 'ACTIVE',
      provider: { sellerProfile: { suspended: false } },
      id: { notIn: ['listing-owned'] },
    });
    expect(secondCallWhere).toEqual(firstCallWhere);
  });

  it('does not let a zero-view brand-new listing automatically outrank a very popular one', async () => {
    const veryPopular = fakeListing({ id: 'very-popular', views: 500, createdAt: daysAgo(10) });
    const brandNew = fakeListing({ id: 'brand-new', views: 0, createdAt: daysAgo(0) });
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce([veryPopular])
      .mockResolvedValueOnce([brandNew]);

    const result = await serviceListingRecommendationsRepository.findTrending([], 1);

    expect(result.map(l => l.id)).toEqual(['very-popular']);
  });

  it('includes a recent item with a low, non-zero view count as a real candidate', async () => {
    const recentLowView = fakeListing({ id: 'recent-low-view', views: 2, createdAt: daysAgo(1) });
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([recentLowView]);

    const result = await serviceListingRecommendationsRepository.findTrending([], 8);

    expect(result.map(l => l.id)).toContain('recent-low-view');
  });

  it('returns an empty array when both candidate pools are empty (cold start)', async () => {
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await serviceListingRecommendationsRepository.findTrending([], 8);

    expect(result).toEqual([]);
  });

  it('produces the same order on repeated calls with the same input (deterministic)', async () => {
    const listings = [1, 2, 3].map(n => fakeListing({ id: `l-${n}`, views: n, createdAt: daysAgo(n * 10) }));
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce(listings.slice())
      .mockResolvedValueOnce([]);
    const first = await serviceListingRecommendationsRepository.findTrending([], 8);

    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce(listings.slice())
      .mockResolvedValueOnce([]);
    const second = await serviceListingRecommendationsRepository.findTrending([], 8);

    expect(second.map(l => l.id)).toEqual(first.map(l => l.id));
  });

  it('breaks a full tie (equal score, equal createdAt) deterministically by id ASC', async () => {
    const sameTimestamp = daysAgo(5);
    const tiedB = fakeListing({ id: 'l-b', views: 5, createdAt: sameTimestamp });
    const tiedA = fakeListing({ id: 'l-a', views: 5, createdAt: sameTimestamp });
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce([tiedB, tiedA])
      .mockResolvedValueOnce([]);

    const result = await serviceListingRecommendationsRepository.findTrending([], 2);

    expect(result.map(l => l.id)).toEqual(['l-a', 'l-b']);
  });

  it('respects limit=1, returning exactly the single top-ranked candidate', async () => {
    const listings = [1, 2, 3].map(n => fakeListing({ id: `l-${n}`, views: n * 10, createdAt: daysAgo(n) }));
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce(listings)
      .mockResolvedValueOnce([]);

    const result = await serviceListingRecommendationsRepository.findTrending([], 1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l-3');
  });

  it('respects limit=24 (the maximum allowed) when more than 24 candidates exist across both pools', async () => {
    const topByViews = Array.from({ length: 20 }, (_, i) =>
      fakeListing({ id: `views-${i}`, views: 100 - i, createdAt: daysAgo(50) }));
    const mostRecent = Array.from({ length: 20 }, (_, i) =>
      fakeListing({ id: `recent-${i}`, views: 0, createdAt: daysAgo(i) }));
    (prisma.serviceListing.findMany as jest.Mock)
      .mockResolvedValueOnce(topByViews)
      .mockResolvedValueOnce(mostRecent);

    const result = await serviceListingRecommendationsRepository.findTrending([], 24);

    expect(result).toHaveLength(24);
    expect(new Set(result.map(l => l.id)).size).toBe(24);
  });
});

// PR4B (Store Recommendations)
describe('storeRecommendationsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('followedStoreIds', () => {
    it('reads StoreFollower rows for the user', async () => {
      (prisma.storeFollower.findMany as jest.Mock).mockResolvedValue([
        { storeId: 'store-1' },
        { storeId: 'store-2' },
      ]);

      const result = await storeRecommendationsRepository.followedStoreIds('user-1');

      expect(prisma.storeFollower.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { storeId: true },
      });
      expect(result).toEqual(['store-1', 'store-2']);
    });

    it('returns [] when the user follows no stores', async () => {
      (prisma.storeFollower.findMany as jest.Mock).mockResolvedValue([]);

      const result = await storeRecommendationsRepository.followedStoreIds('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('favoritedStoreIds', () => {
    it('reads Favorite rows scoped to entityType STORE', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([{ entityId: 'store-3' }]);

      const result = await storeRecommendationsRepository.favoritedStoreIds('user-1');

      expect(prisma.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', entityType: 'STORE' },
        select: { entityId: true },
      });
      expect(result).toEqual(['store-3']);
    });

    it('returns [] when the user has no STORE favorites', async () => {
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);

      const result = await storeRecommendationsRepository.favoritedStoreIds('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('ownStoreId', () => {
    it('resolves the store owned by this user via sellerProfile.userId', async () => {
      (prisma.storeDetails.findFirst as jest.Mock).mockResolvedValue({ id: 'own-store-1' });

      const result = await storeRecommendationsRepository.ownStoreId('user-1');

      expect(prisma.storeDetails.findFirst).toHaveBeenCalledWith({
        where: { sellerProfile: { userId: 'user-1' } },
        select: { id: true },
      });
      expect(result).toBe('own-store-1');
    });

    it('returns null when the user has no store', async () => {
      (prisma.storeDetails.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await storeRecommendationsRepository.ownStoreId('user-1');

      expect(result).toBeNull();
    });
  });

  describe('findRanked', () => {
    it('returns [] without a follow-up findMany when the raw query returns no ids', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await storeRecommendationsRepository.findRanked({
        excludeIds: [],
        limit: 8,
      });

      expect(result).toEqual([]);
      expect(prisma.storeDetails.findMany).not.toHaveBeenCalled();
    });

    // PR5D: query-count verification — findRanked must issue exactly
    // one $queryRaw call (the ranked-id scan) plus, only when that
    // scan actually returns ids, exactly one follow-up
    // storeDetails.findMany (hydrating the ranked ids into full
    // records). Never more than that per call — there is no N+1 here
    // since the hydration is a single `id: { in: ids } }` batch, not
    // one findMany per id.
    it('issues exactly one $queryRaw and one follow-up findMany when ids are found (no N+1)', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'store-1' }, { id: 'store-2' }]);
      (prisma.storeDetails.findMany as jest.Mock).mockResolvedValue([
        { id: 'store-1' },
        { id: 'store-2' },
      ]);

      await storeRecommendationsRepository.findRanked({ excludeIds: [], limit: 8 });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.storeDetails.findMany).toHaveBeenCalledTimes(1);
    });

    it('preserves the ranked order from the raw query, dropping rows since deleted', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'store-2' }, { id: 'store-1' }]);
      (prisma.storeDetails.findMany as jest.Mock).mockResolvedValue([
        { id: 'store-1', name: 'A' },
        // store-2 intentionally absent — simulates a row deleted
        // between the raw id query and the follow-up findMany.
      ]);

      const result = await storeRecommendationsRepository.findRanked({
        excludeIds: [],
        limit: 8,
      });

      expect(result).toEqual([{ id: 'store-1', name: 'A' }]);
    });

    it('passes lat/lng into the raw query only when both are supplied', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await storeRecommendationsRepository.findRanked({
        excludeIds: [],
        lat: 31.5,
        lng: 34.4,
        limit: 8,
      });

      // $queryRaw tagged-nests values inside Prisma.Sql fragments
      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      const serialized = JSON.stringify(callArgs);
      expect(serialized).toContain('31.5');
      expect(serialized).toContain('34.4');
    });

    it('omits geo values from the raw query when lat/lng are absent', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await storeRecommendationsRepository.findRanked({
        excludeIds: [],
        limit: 8,
      });

      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      expect(callArgs).not.toContain(undefined);
    });

    it('includes an exclusion clause only when excludeIds is non-empty', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await storeRecommendationsRepository.findRanked({
        excludeIds: ['store-owned', 'store-followed'],
        limit: 8,
      });

      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      const serialized = JSON.stringify(callArgs);
      expect(serialized).toContain('store-owned');
      expect(serialized).toContain('store-followed');
    });

    it('passes the limit through to the raw query', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await storeRecommendationsRepository.findRanked({ excludeIds: [], limit: 3 });

      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      expect(callArgs).toContain(3);
    });

    // PR5A: composite score smoke tests — findRanked's ranking now
    // happens entirely inside the raw SQL passed to $queryRaw (mocked
    // here), so these confirm the formula's weight literals are
    // actually wired into the query rather than re-verifying the
    // arithmetic itself (that needs a real Postgres — see the
    // corresponding integration tests in recommendations.test.ts).
    it('wires the with-geo weights (0.45 freshness / 0.4 distance / 0.15 plan) into the query when lat/lng are supplied', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await storeRecommendationsRepository.findRanked({ excludeIds: [], lat: 31.5, lng: 34.4, limit: 8 });

      const serialized = JSON.stringify((prisma.$queryRaw as jest.Mock).mock.calls[0]);
      expect(serialized).toContain('0.45');
      expect(serialized).toContain('0.4');
      expect(serialized).toContain('0.15');
    });

    it('wires the no-geo weights (0.75 freshness / 0.25 plan) into the query when lat/lng are absent', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await storeRecommendationsRepository.findRanked({ excludeIds: [], limit: 8 });

      const serialized = JSON.stringify((prisma.$queryRaw as jest.Mock).mock.calls[0]);
      expect(serialized).toContain('0.75');
      expect(serialized).toContain('0.25');
      // The with-geo-only weights must NOT leak into a no-geo query.
      expect(serialized).not.toContain('0.45');
    });

    it('includes an id ASC final tie-break in the query text', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await storeRecommendationsRepository.findRanked({ excludeIds: [], limit: 8 });

      // Same serialization approach the pre-existing lat/lng and
      // excludeIds tests above already use to inspect the tagged-
      // call — not just the interpolated values but the
      // literal segments too, which is where
      // `sd."id" ASC` (written directly in the query , not
      // interpolated) actually lives.
      const serialized = JSON.stringify((prisma.$queryRaw as jest.Mock).mock.calls[0]);
      expect(serialized).toContain('id\\" ASC');
    });
  });
});
