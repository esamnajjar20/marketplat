import { adsService } from '../../src/modules/ads/ads.service';
import { adsRepository } from '../../src/modules/ads/ads.repository';
import { uploadImage, deleteImage } from '../../src/config/cloudinary';
import { viewsBuffer } from '../../src/shared/utils/viewsBuffer';
import { redis } from '../../src/config/redis';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { AdCreationLockedError } from '../../src/shared/utils/adLock';
import { ROLES } from '../../src/shared/constants/roles';
import { createTestUser } from '../helpers/auth.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';

jest.mock('../../src/modules/ads/ads.repository');
jest.mock('../../src/config/env', () => ({
  env: {
    cloudinary: { cloudName: 'demo' },
    ads: { maxPerUser: 50 },
    // createTestUser() (via tests/helpers/auth.helper.ts) calls the real
    // signTokenPair/signAccessToken/signRefreshToken, which read
    // env.jwt.secret/refreshSecret/expiresIn — without these the mock
    // above (originally cloudinary/ads-only) left env.jwt undefined,
    // crashing every test in this file that goes through createTestUser
    // with "Cannot read properties of undefined (reading 'secret')".
    jwt: {
      secret: 'test-only-jwt-secret-not-for-real-use-0000000000000000',
      refreshSecret: 'test-only-jwt-refresh-secret-not-for-real-use-000000',
      expiresIn: '15m',
    },
  },
}));
jest.mock('../../src/config/cloudinary', () => ({
  uploadImage: jest.fn(),
  deleteImage: jest.fn(),
}));
jest.mock('../../src/shared/utils/viewsBuffer', () => ({
  viewsBuffer: { increment: jest.fn().mockResolvedValue(undefined) },
}));

const mockAd = {
  id: 'ad-1',
  userId: 'user-1',
  status: 'ACTIVE',
  title: 'Test Ad',
  images: ['https://res.cloudinary.com/demo/image/upload/v1/ads/photo.jpg'],
  categoryId: 'cat-1',
  city: 'الرياض',
};

describe('AdsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createAd', () => {
    let userId: string;

    beforeEach(async () => {
      // createAd's transaction path calls tx.ad.create() directly
      // against the real (unmocked) prisma client — a fake hardcoded
      // string ID would violate the ads_userId_fkey constraint.
      userId = (await createTestUser({ email: `ads-test-${Date.now()}-${Math.random()}@example.com` })).id;
      await createTestSellerProfile(userId);
      // Default: user is well under the cap unless a test overrides this.
      (adsRepository.countActiveByUserId as jest.Mock).mockResolvedValue(0);
    });

    it('uploads images in parallel and creates ad', async () => {
      (uploadImage as jest.Mock).mockResolvedValue({
        url: 'https://cdn.example.com/img.jpg',
        publicId: 'classifieds/ads/img',
      });

      const files = [{ buffer: Buffer.from('fake') }] as Express.Multer.File[];
      const result = await adsService.createAd(userId, {
        title: 'Test',
        description: 'Description long enough',
        price: 100,
        city: 'الرياض',
        isNegotiable: false,
      }, files);

      // BUGFIX (found while re-verifying this suite): createAd's real
      // implementation inserts via `prisma.$transaction(tx => tx.ad.create(...))`
      // directly — it has never called adsRepository.create (that
      // method now has zero call sites in src/, confirmed by grep).
      // The old assertion `expect(result.id).toBe('ad-1')` only ever
      // passed because it read a value off a mocked adsRepository.create
      // that wasn't actually on the code path being exercised — masking
      // that this test wasn't testing what it claimed to. It's a real
      // DB row now, so assert against the fields we actually control
      // (userId, uploaded image URL) rather than a hardcoded fake id.
      expect(uploadImage).toHaveBeenCalled();
      expect(result.id).toEqual(expect.any(String));
      expect(result.userId).toBe(userId);
      expect(result.images).toEqual(['https://cdn.example.com/img.jpg']);
    });

    it('cleans up uploaded images when ad creation fails', async () => {
      (uploadImage as jest.Mock).mockResolvedValue({
        url: 'https://cdn.example.com/img.jpg',
        publicId: 'classifieds/ads/img',
      });
      (deleteImage as jest.Mock).mockResolvedValue(undefined);
      // BUGFIX: createAd's insert goes through the real Prisma client
      // (see comment above), so forcing a failure means making the
      // real tx.ad.create() call reject — mocking adsRepository.create
      // to reject had no effect on this code path at all. A
      // categoryId that doesn't exist violates the real FK constraint
      // on Ad.categoryId (schema.prisma) — a genuine insert failure
      // without needing to mock Prisma itself. (A negative price
      // won't do this: there's no DB-level check constraint on price,
      // and the positive-number validation lives in Zod at the route
      // layer, which calling adsService.createAd directly bypasses.)
      const files = [{ buffer: Buffer.from('fake') }] as Express.Multer.File[];

      await expect(
        adsService.createAd(
          userId,
          {
            title: 'Test',
            description: 'Description long enough',
            price: 100,
            city: 'Riyadh',
            categoryId: 'nonexistent-category-id',
            isNegotiable: false,
          },
          files
        )
      ).rejects.toThrow();

      expect(deleteImage).toHaveBeenCalledWith('classifieds/ads/img');
    });

    // FIX AUDIT-V5-01 coverage
    it('rejects with BadRequestError when the user is at the active-ad cap', async () => {
      (adsRepository.countActiveByUserId as jest.Mock).mockResolvedValue(50);

      const files = [{ buffer: Buffer.from('fake') }] as Express.Multer.File[];

      await expect(
        adsService.createAd(
          userId,
          {
            title: 'Test',
            description: 'Description long enough',
            price: 100,
            city: 'الرياض',
            isNegotiable: false,
          },
          files
        )
      ).rejects.toThrow(BadRequestError);

      // Must fail fast — no Cloudinary upload should be attempted once
      // the cap check has already failed.
      expect(uploadImage).not.toHaveBeenCalled();
    });

    it('allows creation when the user is just under the active-ad cap', async () => {
      (adsRepository.countActiveByUserId as jest.Mock).mockResolvedValue(49);
      (uploadImage as jest.Mock).mockResolvedValue({
        url: 'https://cdn.example.com/img.jpg',
        publicId: 'classifieds/ads/img',
      });

      const files = [{ buffer: Buffer.from('fake') }] as Express.Multer.File[];
      const result = await adsService.createAd(
        userId,
        {
          title: 'Test',
          description: 'Description long enough',
          price: 100,
          city: 'الرياض',
          isNegotiable: false,
        },
        files
      );

      expect(result.id).toEqual(expect.any(String));
      expect(result.userId).toBe(userId);
    });

    // AUDIT-FIX M-02 coverage: proves the count-check-then-create
    // sequence is now actually serialized per-user via a Redis lock
    // (withUserAdCreationLock), not just correct when called
    // sequentially (which the tests above already covered but
    // couldn't have caught a TOCTOU race even if one existed).
    //
    // BUGFIX (found while re-verifying this suite): the previous
    // version of this test simulated "concurrency" entirely through a
    // mocked adsRepository.create incrementing a local counter — but
    // createAd never calls adsRepository.create (see the comment on
    // the first test in this block), so that mock was inert and the
    // test wasn't exercising the real lock at all. It also asserted
    // the losing call rejects with BadRequestError (cap exceeded),
    // which is the wrong failure mode for genuine concurrent
    // callers: withUserAdCreationLock's Redis NX lock means the
    // second caller to arrive while the first still holds the lock
    // is rejected with AdCreationLockedError (409, "try again"), not
    // a cap-exceeded error — the cap check inside the lock only ever
    // runs for whichever caller actually acquires it. Two genuinely
    // concurrent createAd calls (no `await` between dispatching them)
    // now assert that real behavior instead.
    it('serializes two concurrent createAd calls for the same user so only one acquires the creation lock', async () => {
      (adsRepository.countActiveByUserId as jest.Mock).mockResolvedValue(0);
      (uploadImage as jest.Mock).mockResolvedValue({
        url: 'https://cdn.example.com/img.jpg',
        publicId: 'classifieds/ads/img',
      });
      // The losing concurrent call's catch block runs cleanupUploadedImages,
      // which calls deleteImage on the (wasted) upload — must resolve,
      // not return undefined, or the cleanup call itself would throw.
      (deleteImage as jest.Mock).mockResolvedValue(undefined);

      const files = [{ buffer: Buffer.from('fake') }] as Express.Multer.File[];
      const input = {
        title: 'Test',
        description: 'Description long enough',
        price: 100,
        city: 'الرياض',
        isNegotiable: false,
      };

      // No `await` between dispatching the two calls — genuinely
      // concurrent, both racing for the same per-user Redis lock.
      const results = await Promise.allSettled([
        adsService.createAd(userId, input, files),
        adsService.createAd(userId, input, files),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      // Exactly one of the two concurrent requests may hold the lock
      // and succeed — the other must be rejected, not both let through.
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AdCreationLockedError);
    });
  });

  describe('getAds (Redis cache-aside — FIX AUDIT-V4-06)', () => {
    const query = { page: 1, limit: 20 };

    it('calls the repository and caches the result on a cold cache', async () => {
      (adsRepository.findMany as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });

      const result = await adsService.getAds(query);

      expect(adsRepository.findMany).toHaveBeenCalledTimes(1);
      expect(result.items).toEqual([mockAd]);
    });

    it('serves a second identical request from cache without hitting the repository again', async () => {
      (adsRepository.findMany as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });

      await adsService.getAds(query);
      await adsService.getAds(query);

      // FIX AUDIT-V4-06's entire point: a second identical query within
      // the TTL must not re-hit Postgres.
      expect(adsRepository.findMany).toHaveBeenCalledTimes(1);
    });

    it('uses separate cache entries for different query parameters', async () => {
      (adsRepository.findMany as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });

      await adsService.getAds({ page: 1, limit: 20 });
      await adsService.getAds({ page: 2, limit: 20 });

      expect(adsRepository.findMany).toHaveBeenCalledTimes(2);
    });

    it('falls back to the repository when the cache read throws', async () => {
      (adsRepository.findMany as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });
      (redis.get as jest.Mock).mockRejectedValueOnce(new Error('Redis connection lost'));

      const result = await adsService.getAds(query);

      expect(result.items).toEqual([mockAd]);
      expect(adsRepository.findMany).toHaveBeenCalledTimes(1);
    });

    it('still returns the DB result when the cache write fails', async () => {
      (adsRepository.findMany as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });
      (redis.setex as jest.Mock).mockRejectedValueOnce(new Error('Redis connection lost'));

      const result = await adsService.getAds(query);

      expect(result.items).toEqual([mockAd]);
    });

    it('invalidates the cache (version bump) after createAd, so a subsequent getAds re-hits the repository', async () => {
      // createAd's transaction path calls tx.ad.create() directly against
      // the real (unmocked) prisma client — a fake hardcoded 'user-1'
      // string violates the ads_userId_fkey constraint. adsRepository.create
      // is never called on this path either, so mocking it did nothing.
      const { id: realUserId } = await createTestUser({
        email: `ads-cache-test-${Date.now()}-${Math.random()}@example.com`,
      });
      await createTestSellerProfile(realUserId);
      (adsRepository.findMany as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });
      (adsRepository.countActiveByUserId as jest.Mock).mockResolvedValue(0);
      (uploadImage as jest.Mock).mockResolvedValue({ url: 'https://example.com/x.jpg', publicId: 'x' });

      await adsService.getAds(query); // populates cache, 1 repository call
      await adsService.createAd(realUserId, { title: 'New', description: 'desc', city: 'غزة' } as any, []);
      await adsService.getAds(query); // must NOT be served from the now-stale cache

      expect(adsRepository.findMany).toHaveBeenCalledTimes(2);
    });

    it('invalidates the cache after updateAd (covers mark-as-sold via status change)', async () => {
      (adsRepository.findMany as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (adsRepository.update as jest.Mock).mockResolvedValue({ ...mockAd, status: 'SOLD' });

      await adsService.getAds(query);
      await adsService.updateAd('ad-1', 'user-1', ROLES.USER, { status: 'SOLD' } as any);
      await adsService.getAds(query);

      expect(adsRepository.findMany).toHaveBeenCalledTimes(2);
    });

    it('invalidates the cache after deleteAd', async () => {
      (adsRepository.findMany as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (adsRepository.softDelete as jest.Mock).mockResolvedValue(undefined);

      await adsService.getAds(query);
      await adsService.deleteAd('ad-1', 'user-1', ROLES.USER);
      await adsService.getAds(query);

      expect(adsRepository.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMyAds (status filter — FIX AUDIT-V4 D-24)', () => {
    it('passes the user-supplied status through to findManyByUserId as statusFilter', async () => {
      (adsRepository.findManyByUserId as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });

      await adsService.getMyAds('user-1', { page: 1, limit: 20, status: 'SOLD' } as any);

      expect(adsRepository.findManyByUserId).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ statusFilter: 'SOLD' }),
      );
    });

    it('passes statusFilter=undefined (show all non-filtered) when no status is requested', async () => {
      (adsRepository.findManyByUserId as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });

      await adsService.getMyAds('user-1', { page: 1, limit: 20 } as any);

      expect(adsRepository.findManyByUserId).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ statusFilter: undefined }),
      );
    });

    it('does not use the public getAds cache for my-ads queries', async () => {
      (adsRepository.findManyByUserId as jest.Mock).mockResolvedValue({ ads: [mockAd], total: 1 });

      await adsService.getMyAds('user-1', { page: 1, limit: 20 } as any);
      await adsService.getMyAds('user-1', { page: 1, limit: 20 } as any);

      // getMyAds is user-scoped and must never be cached/shared across
      // users via the same mechanism as the public listing cache.
      expect(adsRepository.findManyByUserId).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAdById', () => {
    it('increments views when viewerIp provided', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      await adsService.getAdById('ad-1', '127.0.0.1');
      expect(viewsBuffer.increment).toHaveBeenCalledWith('ad-1', '127.0.0.1');
    });

    it('throws for deleted ad', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue({ ...mockAd, status: 'DELETED' });
      await expect(adsService.getAdById('ad-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getRelatedAds', () => {
    it('returns related ads', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (adsRepository.findRelated as jest.Mock).mockResolvedValue([mockAd]);

      const result = await adsService.getRelatedAds('ad-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('findAdForReference', () => {
    it('returns null for deleted ad', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue({ ...mockAd, status: 'DELETED' });
      const result = await adsService.findAdForReference('ad-1');
      expect(result).toBeNull();
    });
  });

  describe('addImages', () => {
    it('throws when exceeding 10 images', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockAd,
        images: Array(10).fill('url'),
      });

      await expect(
        adsService.addImages('ad-1', 'user-1', ROLES.USER, [{ buffer: Buffer.from('x') }] as Express.Multer.File[])
      ).rejects.toThrow(/maximum of 10 images/);
    });

    it('throws forbidden for non-owner non-admin', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      await expect(
        adsService.addImages('ad-1', 'other-user', ROLES.USER, [])
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('updateAd', () => {
    it('prevents regular users from setting ACTIVE status', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue({ ...mockAd, status: 'SOLD' });

      await expect(
        adsService.updateAd('ad-1', 'user-1', ROLES.USER, { status: 'ACTIVE' as any })
      ).rejects.toThrow(ForbiddenError);
    });

    it('prevents regular users from setting DELETED status', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);

      await expect(
        adsService.updateAd('ad-1', 'user-1', ROLES.USER, { status: 'DELETED' as any })
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows regular users to mark their ad as SOLD', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (adsRepository.update as jest.Mock).mockResolvedValue({ ...mockAd, status: 'SOLD' });

      const result = await adsService.updateAd('ad-1', 'user-1', ROLES.USER, {
        status: 'SOLD' as any,
      });

      expect(result.status).toBe('SOLD');
      expect(adsRepository.update).toHaveBeenCalledWith('ad-1', { status: 'SOLD' });
    });
  });

  describe('removeImage', () => {
    it('throws when image not in ad', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      await expect(
        adsService.removeImage('ad-1', 'user-1', ROLES.USER, 'https://unknown.com/img.jpg')
      ).rejects.toThrow(BadRequestError);
    });

    it('removes image and calls cloudinary delete', async () => {
      const adWithTwoImages = { ...mockAd, images: [...mockAd.images, 'https://res.cloudinary.com/demo/image/upload/v1/ads/photo2.jpg'] };
      (adsRepository.findById as jest.Mock).mockResolvedValue(adWithTwoImages);
      (deleteImage as jest.Mock).mockResolvedValue(undefined);
      (adsRepository.removeImage as jest.Mock).mockResolvedValue(mockAd);

      await adsService.removeImage('ad-1', 'user-1', ROLES.USER, adWithTwoImages.images[0]);
      expect(deleteImage).toHaveBeenCalled();
    });

    it('continues when cloudinary delete fails', async () => {
      const adWithTwoImages = { ...mockAd, images: [...mockAd.images, 'https://res.cloudinary.com/demo/image/upload/v1/ads/photo2.jpg'] };
      (adsRepository.findById as jest.Mock).mockResolvedValue(adWithTwoImages);
      (deleteImage as jest.Mock).mockRejectedValue(new Error('Cloudinary error'));
      (adsRepository.removeImage as jest.Mock).mockResolvedValue(mockAd);

      await expect(
        adsService.removeImage('ad-1', 'user-1', ROLES.USER, adWithTwoImages.images[0])
      ).resolves.toBeDefined();
    });
  });

  describe('deleteAd', () => {
    it('allows admin to delete any ad', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (adsRepository.softDelete as jest.Mock).mockResolvedValue(undefined);

      await adsService.deleteAd('ad-1', 'admin-1', ROLES.ADMIN);
      expect(adsRepository.softDelete).toHaveBeenCalledWith('ad-1');
    });
  });
});
