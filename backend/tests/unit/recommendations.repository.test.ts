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

      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      expect(callArgs).toContain(31.5);
      expect(callArgs).toContain(34.4);
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
      expect(callArgs).toContain('store-owned');
      expect(callArgs).toContain('store-followed');
    });

    it('passes the limit through to the raw query', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await storeRecommendationsRepository.findRanked({ excludeIds: [], limit: 3 });

      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      expect(callArgs).toContain(3);
    });
  });
});
