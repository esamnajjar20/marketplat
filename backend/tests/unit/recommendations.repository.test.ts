import {
  recommendationsRepository,
  productRecommendationsRepository,
  serviceListingRecommendationsRepository,
  storeRecommendationsRepository,
} from '../../src/modules/recommendations/recommendations.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    favorite: { findMany: jest.fn() },
    ad: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    serviceListing: { findMany: jest.fn() },
    userActivity: { findMany: jest.fn() },
    storeFollower: { findMany: jest.fn() },
    storeDetails: { findFirst: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

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
    // Tagged-template call: [stringsArray, ...interpolatedValues] — the
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

      // $queryRaw tagged-template nests values inside Prisma.Sql fragments
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
      // template call — not just the interpolated values but the
      // literal template-string segments too, which is where
      // `sd."id" ASC` (written directly in the query template, not
      // interpolated) actually lives.
      const serialized = JSON.stringify((prisma.$queryRaw as jest.Mock).mock.calls[0]);
      expect(serialized).toContain('id\\" ASC');
    });
  });
});
