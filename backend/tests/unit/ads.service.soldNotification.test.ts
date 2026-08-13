import { adsService } from '../../src/modules/ads/ads.service';
import { adsRepository } from '../../src/modules/ads/ads.repository';
import { favoritesRepository } from '../../src/modules/favorites/favorites.repository';
import { notificationEvents } from '../../src/modules/notifications';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';
import { ROLES } from '../../src/shared/constants/roles';
import { AdStatus, Prisma } from '@prisma/client';

/**
 * Gap #15: mirrors ads.service.priceChangeNotification.test.ts's own
 * setup/rationale (separate file so we can mock favoritesRepository/
 * notifications without touching ads.service.test.ts's existing mocks),
 * but for the ACTIVE -> SOLD transition instead of a price change.
 */
jest.mock('../../src/modules/ads/ads.repository');
jest.mock('../../src/modules/favorites/favorites.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
// The ACTIVE -> SOLD path with a sellerProfileId set bypasses
// adsRepository entirely and opens a real prisma.$transaction (see
// ads.service.ts's updateAd, the `justSold` branch) so tx.ad.update
// runs against a real, unmocked prisma otherwise — mock $transaction
// to hand the callback a fake tx whose ad.update just echoes back the
// expected updated ad, matching what adsRepository.update's mock
// would have returned on the non-sellerProfile path.
jest.mock('../../src/config/prisma', () => ({
  prisma: { $transaction: jest.fn() },
}));
jest.mock('../../src/modules/notifications', () => ({
  notificationEvents: {
    onFavoritedAdPriceChanged: jest.fn(),
    onFavoritedAdSold: jest.fn(),
  },
}));
jest.mock('../../src/config/env', () => ({
  env: {
    cloudinary: { cloudName: 'demo' },
    ads: { maxPerUser: 50, imageLockTtlSeconds: 30 },
    locks: {
      sellerLockTtlSeconds: 30,
      storeLockTtlSeconds: 30,
      serviceProviderLockTtlSeconds: 30,
    },
    jwt: {
      secret: 'test-only-jwt-secret-not-for-real-use-0000000000000000',
      refreshSecret: 'test-only-jwt-refresh-secret-not-for-real-use-000000',
      expiresIn: '15m',
    },
  },
}));

const flushMicrotasks = () => new Promise(process.nextTick);

const baseAd = {
  id: 'ad-1',
  userId: 'user-1',
  status: AdStatus.ACTIVE,
  title: 'Old Title',
  price: new Prisma.Decimal(100),
  images: ['https://res.cloudinary.com/demo/image/upload/v1/ads/photo.jpg'],
  categoryId: 'cat-1',
  city: 'الرياض',
};

describe('AdsService.updateAd — FAV_AD_SOLD notification trigger (Gap #15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (favoritesRepository.findUserIdsByAdId as jest.Mock).mockResolvedValue(['fav-user-1']);
    (notificationEvents.onFavoritedAdSold as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('fires for a plain ad with no SellerProfile (sellerProfileId null)', async () => {
    const ad = { ...baseAd, sellerProfileId: null };
    (adsRepository.findById as jest.Mock).mockResolvedValue(ad);
    (adsRepository.update as jest.Mock).mockResolvedValue({ ...ad, status: AdStatus.SOLD });

    await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { status: AdStatus.SOLD });
    await flushMicrotasks();

    // Must not take the sellerProfile transaction path...
    expect(sellersRepository.decrementActiveAdsOnSold).not.toHaveBeenCalled();
    // ...but must still notify favoriters. This is the core regression
    // this test guards against: gating the notification on the same
    // `justSold` flag used for the SellerProfile stat bump would skip
    // every ad without a seller profile, i.e. most ads.
    expect(favoritesRepository.findUserIdsByAdId).toHaveBeenCalledWith('ad-1');
    expect(notificationEvents.onFavoritedAdSold).toHaveBeenCalledWith(
      ['fav-user-1'],
      'ad-1',
      'Old Title'
    );
  });

  it('fires for an ad with a SellerProfile, alongside the stat decrement', async () => {
    const ad = { ...baseAd, sellerProfileId: 'seller-1' };
    (adsRepository.findById as jest.Mock).mockResolvedValue(ad);
    (sellersRepository.decrementActiveAdsOnSold as jest.Mock).mockResolvedValue(undefined);
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({ ad: { update: jest.fn().mockResolvedValue({ ...ad, status: AdStatus.SOLD }) } })
    );

    await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { status: AdStatus.SOLD });
    await flushMicrotasks();

    expect(sellersRepository.decrementActiveAdsOnSold).toHaveBeenCalledWith(
      expect.anything(),
      'seller-1'
    );
    expect(notificationEvents.onFavoritedAdSold).toHaveBeenCalledWith(
      ['fav-user-1'],
      'ad-1',
      'Old Title'
    );
  });

  it('does not fire when the ad is already SOLD (no real transition)', async () => {
    const ad = { ...baseAd, status: AdStatus.SOLD, sellerProfileId: null };
    (adsRepository.findById as jest.Mock).mockResolvedValue(ad);
    (adsRepository.update as jest.Mock).mockResolvedValue(ad);

    await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { status: AdStatus.SOLD });
    await flushMicrotasks();

    expect(favoritesRepository.findUserIdsByAdId).not.toHaveBeenCalled();
    expect(notificationEvents.onFavoritedAdSold).not.toHaveBeenCalled();
  });

  it('does not fire on an unrelated field update (no status change)', async () => {
    const ad = { ...baseAd, sellerProfileId: null };
    (adsRepository.findById as jest.Mock).mockResolvedValue(ad);
    (adsRepository.update as jest.Mock).mockResolvedValue({ ...ad, title: 'New Title' });

    await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { title: 'New Title' });
    await flushMicrotasks();

    expect(favoritesRepository.findUserIdsByAdId).not.toHaveBeenCalled();
    expect(notificationEvents.onFavoritedAdSold).not.toHaveBeenCalled();
  });

  it('still returns the updated ad even when the notification fan-out fails', async () => {
    const ad = { ...baseAd, sellerProfileId: null };
    const updatedAd = { ...ad, status: AdStatus.SOLD };
    (adsRepository.findById as jest.Mock).mockResolvedValue(ad);
    (adsRepository.update as jest.Mock).mockResolvedValue(updatedAd);
    (favoritesRepository.findUserIdsByAdId as jest.Mock).mockRejectedValue(new Error('db down'));

    const result = await adsService.updateAd('ad-1', 'user-1', ROLES.USER, {
      status: AdStatus.SOLD,
    });
    await flushMicrotasks();

    expect(result).toEqual(updatedAd);
  });
});
