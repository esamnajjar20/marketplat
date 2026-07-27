import { adsService } from '../../src/modules/ads/ads.service';
import { adsRepository } from '../../src/modules/ads/ads.repository';
import { uploadImage, deleteImage } from '../../src/config/cloudinary';
import { viewsBuffer } from '../../src/shared/utils/viewsBuffer';
import { redis } from '../../src/config/redis';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { ROLES } from '../../src/shared/constants/roles';
import { createTestUser } from '../helpers/auth.helper';

jest.mock('../../src/modules/ads/ads.repository');
jest.mock('../../src/config/env', () => ({
  env: { cloudinary: { cloudName: 'demo' }, ads: { maxPerUser: 50 } },
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
      // Default: user is well under the cap unless a test overrides this.
      (adsRepository.countActiveByUserId as jest.Mock).mockResolvedValue(0);
    });

    it('uploads images in parallel and creates ad', async () => {
      (uploadImage as jest.Mock).mockResolvedValue({
        url: 'https://cdn.example.com/img.jpg',
        publicId: 'classifieds/ads/img',
      });
      (adsRepository.create as jest.Mock).mockResolvedValue(mockAd);

      const files = [{ buffer: Buffer.from('fake') }] as Express.Multer.File[];
      const result = await adsService.createAd(userId, {
        title: 'Test',
        description: 'Description long enough',
        price: 100,
        city: 'الرياض',
        isNegotiable: false,
      }, files);

      expect(uploadImage).toHaveBeenCalled();
      expect(result.id).toBe('ad-1');
    });

    it('cleans up uploaded images when ad creation fails', async () => {
      (uploadImage as jest.Mock).mockResolvedValue({
        url: 'https://cdn.example.com/img.jpg',
        publicId: 'classifieds/ads/img',
      });
      (deleteImage as jest.Mock).mockResolvedValue(undefined);
      (adsRepository.create as jest.Mock).mockRejectedValue(new Error('DB error'));

      const files = [{ buffer: Buffer.from('fake') }] as Express.Multer.File[];

      await expect(
        adsService.createAd(
          userId,
          {
            title: 'Test',
            description: 'Description long enough',
            price: 100,
            city: 'Riyadh',
            isNegotiable: false,
          },
          files
        )
      ).rejects.toThrow('DB error');

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
      expect(adsRepository.create).not.toHaveBeenCalled();
    });

    it('allows creation when the user is just under the active-ad cap', async () => {
      (adsRepository.countActiveByUserId as jest.Mock).mockResolvedValue(49);
      (uploadImage as jest.Mock).mockResolvedValue({
        url: 'https://cdn.example.com/img.jpg',
        publicId: 'classifieds/ads/img',
      });
      (adsRepository.create as jest.Mock).mockResolvedValue(mockAd);

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

      expect(result.id).toBe('ad-1');
    });

    // AUDIT-FIX M-02 coverage: proves the count-check-then-create
    // sequence is now actually serialized per-user, not just correct
    // when called sequentially (which the tests above already covered
    // but couldn't have caught a TOCTOU race even if one existed).
    it('serializes two concurrent createAd calls for the same user so the second sees the first’s committed count', async () => {
      // Simulate a real DB: countActiveByUserId reflects how many
      // `create` calls have actually completed so far, not a fixed
      // mocked value — this is what makes the test able to detect a
      // race (a broken, unlocked version of createAd would have both
      // calls read the pre-creation count and both pass).
      let committedCount = 0;
      (adsRepository.countActiveByUserId as jest.Mock).mockImplementation(
        async () => committedCount
      );
      (adsRepository.create as jest.Mock).mockImplementation(async () => {
        committedCount += 1;
        return mockAd;
      });
      (uploadImage as jest.Mock).mockResolvedValue({
        url: 'https://cdn.example.com/img.jpg',
        publicId: 'classifieds/ads/img',
      });
      // The losing concurrent call's catch block runs cleanupUploadedImages,
      // which calls deleteImage on the (wasted) upload — must resolve,
      // not return undefined, or the cleanup call itself would throw.
      (deleteImage as jest.Mock).mockResolvedValue(undefined);

      // maxPerUser is mocked to 50 above; simulate the user already
      // sitting one below the cap so a single successful create should
      // push them to the cap and a concurrent second one must be
      // rejected rather than both succeeding.
      committedCount = 49;

      const files = [{ buffer: Buffer.from('fake') }] as Express.Multer.File[];
      const input = {
        title: 'Test',
        description: 'Description long enough',
        price: 100,
        city: 'الرياض',
        isNegotiable: false,
      };

      const results = await Promise.allSettled([
        adsService.createAd(userId, input, files),
        adsService.createAd(userId, input, files),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      // Exactly one of the two concurrent requests may succeed — the
      // race this fix closes would otherwise let both through.
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestError);
      expect(adsRepository.create).toHaveBeenCalledTimes(1);
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
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (deleteImage as jest.Mock).mockResolvedValue(undefined);
      (adsRepository.removeImage as jest.Mock).mockResolvedValue(mockAd);

      await adsService.removeImage('ad-1', 'user-1', ROLES.USER, mockAd.images[0]);
      expect(deleteImage).toHaveBeenCalled();
    });

    it('continues when cloudinary delete fails', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (deleteImage as jest.Mock).mockRejectedValue(new Error('Cloudinary error'));
      (adsRepository.removeImage as jest.Mock).mockResolvedValue(mockAd);

      await expect(
        adsService.removeImage('ad-1', 'user-1', ROLES.USER, mockAd.images[0])
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
