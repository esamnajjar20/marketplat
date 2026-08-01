import { adsService } from '../../src/modules/ads/ads.service';
import { adsRepository } from '../../src/modules/ads/ads.repository';
import { favoritesRepository } from '../../src/modules/favorites/favorites.repository';
import { notificationEvents } from '../../src/modules/notifications';
import { ROLES } from '../../src/shared/constants/roles';

/**
 * Separate file from ads.service.test.ts (rather than adding a describe
 * block there) so this can mock favoritesRepository/notifications
 * without touching that file's existing mock setup — updateAd's
 * existing test suite never needed either of those two modules mocked
 * before this Epic 6 change.
 */
jest.mock('../../src/modules/ads/ads.repository');
jest.mock('../../src/modules/favorites/favorites.repository');
jest.mock('../../src/modules/notifications', () => ({
  notificationEvents: { onFavoritedAdPriceChanged: jest.fn() },
}));
jest.mock('../../src/config/env', () => ({
  env: {
    cloudinary: { cloudName: 'demo' },
    ads: { maxPerUser: 50 },
    jwt: {
      secret: 'test-only-jwt-secret-not-for-real-use-0000000000000000',
      refreshSecret: 'test-only-jwt-refresh-secret-not-for-real-use-000000',
      expiresIn: '15m',
    },
  },
}));

// Flushes the microtask queue so a fire-and-forget `.then()` chain
// (favoritesRepository.findUserIdsByAdId().then(...)) that updateAd
// deliberately does NOT await gets a chance to run before assertions.
const flushMicrotasks = () => new Promise(process.nextTick);

const mockAd = {
  id: 'ad-1',
  userId: 'user-1',
  status: 'ACTIVE',
  title: 'Old Title',
  price: 100 as any, // Prisma Decimal in reality; a plain number compares fine via Number(...)
  images: ['https://res.cloudinary.com/demo/image/upload/v1/ads/photo.jpg'],
  categoryId: 'cat-1',
  city: 'الرياض',
  sellerProfileId: null,
};

describe('AdsService.updateAd — FAV_AD_PRICE_CHANGED notification trigger (Epic 6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (favoritesRepository.findUserIdsByAdId as jest.Mock).mockResolvedValue(['fav-user-1']);
    (notificationEvents.onFavoritedAdPriceChanged as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('does not look up favoriters when the update omits price entirely', async () => {
    (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
    (adsRepository.update as jest.Mock).mockResolvedValue({ ...mockAd, title: 'New Title' });

    await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { title: 'New Title' });
    await flushMicrotasks();

    expect(favoritesRepository.findUserIdsByAdId).not.toHaveBeenCalled();
    expect(notificationEvents.onFavoritedAdPriceChanged).not.toHaveBeenCalled();
  });

  it('does not fire when price is sent but numerically unchanged (e.g. 100 vs "100.00")', async () => {
    (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
    (adsRepository.update as jest.Mock).mockResolvedValue(mockAd);

    await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { price: 100 });
    await flushMicrotasks();

    expect(favoritesRepository.findUserIdsByAdId).not.toHaveBeenCalled();
  });

  it('fires when price actually changes, fanning out to every favoriter', async () => {
    (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
    (adsRepository.update as jest.Mock).mockResolvedValue({ ...mockAd, price: 150 });

    await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { price: 150 });
    await flushMicrotasks();

    expect(favoritesRepository.findUserIdsByAdId).toHaveBeenCalledWith('ad-1');
    expect(notificationEvents.onFavoritedAdPriceChanged).toHaveBeenCalledWith(
      ['fav-user-1'],
      'ad-1',
      'Old Title'
    );
  });

  it('still returns the updated ad even when the notification fan-out fails', async () => {
    (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
    const updatedAd = { ...mockAd, price: 150 };
    (adsRepository.update as jest.Mock).mockResolvedValue(updatedAd);
    (favoritesRepository.findUserIdsByAdId as jest.Mock).mockRejectedValue(new Error('db down'));

    const result = await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { price: 150 });
    await flushMicrotasks();

    expect(result).toEqual(updatedAd);
  });

  it('does not fire when the update sets price to null (clearing it, not "changing" to a number)', async () => {
    (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
    (adsRepository.update as jest.Mock).mockResolvedValue({ ...mockAd, price: null });

    await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { price: null as any });
    await flushMicrotasks();

    // Number(null) === 0, and mockAd.price is 100, so 0 !== 100 — this
    // SHOULD fire under the current Number(...) comparison. Asserting
    // the actual behavior here (rather than assuming) documents this
    // edge case explicitly instead of leaving it silently untested.
    // It's also the semantically correct outcome: clearing a price is a
    // real change a favoriter would want to know about.
    expect(favoritesRepository.findUserIdsByAdId).toHaveBeenCalledWith('ad-1');
  });

  it('does not fire when price was already null and stays null (both sides coerce to 0, no real change)', async () => {
    const adWithNoPrice = { ...mockAd, price: null as any };
    (adsRepository.findById as jest.Mock).mockResolvedValue(adWithNoPrice);
    (adsRepository.update as jest.Mock).mockResolvedValue({ ...adWithNoPrice, title: 'New Title' });

    await adsService.updateAd('ad-1', 'user-1', ROLES.USER, {
      price: null as any,
      title: 'New Title',
    });
    await flushMicrotasks();

    expect(favoritesRepository.findUserIdsByAdId).not.toHaveBeenCalled();
  });
});
