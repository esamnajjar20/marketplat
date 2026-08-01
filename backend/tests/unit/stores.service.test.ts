import { storesService, requireOwnStoreForProducts } from '../../src/modules/stores/stores.service';
import { storesRepository } from '../../src/modules/stores/stores.repository';
import { storeFollowersRepository } from '../../src/modules/stores/store-followers.repository';
import { storeReviewsRepository } from '../../src/modules/stores/store-reviews.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';
import { Prisma } from '@prisma/client';
import { withStoreCreationLock } from '../../src/shared/utils/storeLock';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

// isPrismaError inside stores.service.ts does an `instanceof
// Prisma.PrismaClientKnownRequestError` check, so a plain
// `{ code: 'P2025' }` object would NOT satisfy it — it must be a real
// instance of this class to exercise the "treat as success" branches
// in toggleFollow below (same pattern admin.service.test.ts uses).
const prismaKnownError = (code: string): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: '5.0.0',
  });

jest.mock('../../src/modules/stores/stores.repository');
jest.mock('../../src/modules/stores/store-followers.repository');
jest.mock('../../src/modules/stores/store-reviews.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/shared/utils/storeLock');
jest.mock('../../src/config/prisma', () => ({
  prisma: { $transaction: jest.fn() },
}));

const userId = 'user-1';
const storeId = 'store-1';
const sellerProfileId = 'seller-profile-1';

const mockSellerProfile = { id: sellerProfileId, userId, suspended: false } as any;
const mockStore = {
  id: storeId,
  sellerProfileId,
  status: 'ACTIVE',
  plan: 'FREE',
} as any;

const createInput = {
  name: 'My Store',
  description: 'A store description with enough characters',
  city: 'غزة',
  phone: '0599111222',
};

describe('storesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default, run the wrapped callback straight through — most tests
    // only care about what happens inside the lock, not the lock itself.
    (withStoreCreationLock as jest.Mock).mockImplementation((_id, fn) => fn());
  });

  describe('createStore', () => {
    it('throws BadRequestError when the user has no seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);

      await expect(storesService.createStore(userId, createInput)).rejects.toThrow(
        'You need a seller profile before opening a store.'
      );
      expect(withStoreCreationLock).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when the seller profile is suspended', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({
        ...mockSellerProfile,
        suspended: true,
      });

      await expect(storesService.createStore(userId, createInput)).rejects.toThrow(ForbiddenError);
      expect(withStoreCreationLock).not.toHaveBeenCalled();
    });

    it('throws ConflictError on the unlocked pre-check when a store already exists', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockStore);

      await expect(storesService.createStore(userId, createInput)).rejects.toThrow(
        'You already have a store.'
      );
      expect(withStoreCreationLock).not.toHaveBeenCalled();
    });

    it('throws ConflictError on the locked re-check even if the unlocked pre-check passed (TOCTOU)', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock)
        .mockResolvedValueOnce(null) // unlocked pre-check
        .mockResolvedValueOnce(mockStore); // locked re-check

      await expect(storesService.createStore(userId, createInput)).rejects.toThrow(ConflictError);
    });

    it('creates the store inside a transaction when no store exists', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb({}));
      (storesRepository.create as jest.Mock).mockResolvedValue(mockStore);

      const result = await storesService.createStore(userId, createInput);

      expect(result).toEqual(mockStore);
      expect(storesRepository.create).toHaveBeenCalledWith(
        {},
        sellerProfileId,
        expect.objectContaining({
          name: createInput.name,
          description: createInput.description,
          city: createInput.city,
          phone: createInput.phone,
        })
      );
    });

    it('translates a P2002 unique-constraint race into ConflictError', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockRejectedValue({ code: 'P2002' });

      await expect(storesService.createStore(userId, createInput)).rejects.toThrow(ConflictError);
    });

    it('rethrows unrelated errors from the transaction unchanged', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      const dbError = new Error('connection lost');
      (prisma.$transaction as jest.Mock).mockRejectedValue(dbError);

      await expect(storesService.createStore(userId, createInput)).rejects.toThrow('connection lost');
    });
  });

  describe('getMyStore', () => {
    it('throws NotFoundError when the user has no seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);

      await expect(storesService.getMyStore(userId)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the seller profile has no store', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);

      await expect(storesService.getMyStore(userId)).rejects.toThrow('Store not found');
    });

    it('returns the store when found', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockStore);

      const result = await storesService.getMyStore(userId);

      expect(result).toEqual(mockStore);
    });
  });

  describe('updateMyStore', () => {
    it('throws BadRequestError when the user has no seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);

      await expect(storesService.updateMyStore(userId, { name: 'New Name' })).rejects.toThrow(
        BadRequestError
      );
    });

    it('throws ForbiddenError when the seller profile is suspended', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({
        ...mockSellerProfile,
        suspended: true,
      });

      await expect(storesService.updateMyStore(userId, { name: 'New Name' })).rejects.toThrow(
        ForbiddenError
      );
    });

    it('throws BadRequestError when the seller profile has no store yet', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);

      await expect(storesService.updateMyStore(userId, { name: 'New Name' })).rejects.toThrow(
        'You need to create your store first.'
      );
    });

    it('updates the store owned by the user', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockStore);
      const updated = { ...mockStore, name: 'New Name' };
      (storesRepository.update as jest.Mock).mockResolvedValue(updated);

      const result = await storesService.updateMyStore(userId, { name: 'New Name' });

      expect(storesRepository.update).toHaveBeenCalledWith(storeId, { name: 'New Name' });
      expect(result).toEqual(updated);
    });
  });

  describe('getPublicStore', () => {
    it('throws NotFoundError when the store does not exist', async () => {
      (storesRepository.findPublicById as jest.Mock).mockResolvedValue(null);

      await expect(storesService.getPublicStore(storeId)).rejects.toThrow(NotFoundError);
    });

    it('returns the store with seller and counts when found', async () => {
      const publicStore = { ...mockStore, _count: { followers: 2, products: 4 } };
      (storesRepository.findPublicById as jest.Mock).mockResolvedValue(publicStore);

      const result = await storesService.getPublicStore(storeId);

      expect(result).toEqual(publicStore);
    });
  });

  describe('getStores', () => {
    it('builds pagination meta from the repository total, page, and limit', async () => {
      (storesRepository.findMany as jest.Mock).mockResolvedValue({
        stores: [mockStore],
        total: 1,
      });

      const result = await storesService.getStores({ page: 1, limit: 20 });

      expect(result.stores).toEqual([mockStore]);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('defaults page and limit when not provided in the query', async () => {
      (storesRepository.findMany as jest.Mock).mockResolvedValue({ stores: [], total: 0 });

      const result = await storesService.getStores({});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('updateStoreStatus', () => {
    it('throws NotFoundError when the store does not exist', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(storesService.updateStoreStatus(storeId, { status: 'ACTIVE' })).rejects.toThrow(
        NotFoundError
      );
    });

    it('updates the store status when found', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      const blocked = { ...mockStore, status: 'BLOCKED' };
      (storesRepository.updateStatus as jest.Mock).mockResolvedValue(blocked);

      const result = await storesService.updateStoreStatus(storeId, { status: 'BLOCKED' });

      expect(storesRepository.updateStatus).toHaveBeenCalledWith(storeId, 'BLOCKED');
      expect(result).toEqual(blocked);
    });
  });

  describe('toggleFollow', () => {
    it('throws NotFoundError when the store does not exist', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(storesService.toggleFollow(userId, storeId)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the store is not ACTIVE', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue({ ...mockStore, status: 'PENDING' });

      await expect(storesService.toggleFollow(userId, storeId)).rejects.toThrow('Store not found');
    });

    it('throws ForbiddenError when the user tries to follow their own store', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({ userId });

      await expect(storesService.toggleFollow(userId, storeId)).rejects.toThrow(
        'You cannot follow your own store.'
      );
    });

    it('follows the store when no existing follow row exists', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({ userId: 'someone-else' });
      (storeFollowersRepository.findByUserAndStore as jest.Mock).mockResolvedValue(null);
      (storeFollowersRepository.create as jest.Mock).mockResolvedValue({});

      const result = await storesService.toggleFollow(userId, storeId);

      expect(storeFollowersRepository.create).toHaveBeenCalledWith(userId, storeId);
      expect(result).toEqual({ action: 'followed' });
    });

    it('unfollows the store when a follow row already exists', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({ userId: 'someone-else' });
      (storeFollowersRepository.findByUserAndStore as jest.Mock).mockResolvedValue({ id: 'f-1' });
      (storeFollowersRepository.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await storesService.toggleFollow(userId, storeId);

      expect(storeFollowersRepository.delete).toHaveBeenCalledWith(userId, storeId);
      expect(result).toEqual({ action: 'unfollowed' });
    });

    it('treats a P2025 race on unfollow (already deleted concurrently) as a successful unfollow', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({ userId: 'someone-else' });
      (storeFollowersRepository.findByUserAndStore as jest.Mock).mockResolvedValue({ id: 'f-1' });
      (storeFollowersRepository.delete as jest.Mock).mockRejectedValue(prismaKnownError('P2025'));

      const result = await storesService.toggleFollow(userId, storeId);

      expect(result).toEqual({ action: 'unfollowed' });
    });

    it('rethrows a non-P2025 error on unfollow', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({ userId: 'someone-else' });
      (storeFollowersRepository.findByUserAndStore as jest.Mock).mockResolvedValue({ id: 'f-1' });
      const err = { code: 'P9999' };
      (storeFollowersRepository.delete as jest.Mock).mockRejectedValue(err);

      await expect(storesService.toggleFollow(userId, storeId)).rejects.toEqual(err);
    });

    it('treats a P2002 race on follow (already created concurrently) as a successful follow', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({ userId: 'someone-else' });
      (storeFollowersRepository.findByUserAndStore as jest.Mock).mockResolvedValue(null);
      (storeFollowersRepository.create as jest.Mock).mockRejectedValue(prismaKnownError('P2002'));

      const result = await storesService.toggleFollow(userId, storeId);

      expect(result).toEqual({ action: 'followed' });
    });

    it('rethrows a non-P2002 error on follow', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({ userId: 'someone-else' });
      (storeFollowersRepository.findByUserAndStore as jest.Mock).mockResolvedValue(null);
      const err = { code: 'P9999' };
      (storeFollowersRepository.create as jest.Mock).mockRejectedValue(err);

      await expect(storesService.toggleFollow(userId, storeId)).rejects.toEqual(err);
    });
  });

  describe('getMyFollowedStores', () => {
    it('builds pagination meta from the followers repository result', async () => {
      const follows = [{ id: 'f-1' }];
      (storeFollowersRepository.findManyByUserId as jest.Mock).mockResolvedValue({
        follows,
        total: 1,
      });

      const result = await storesService.getMyFollowedStores(userId, { page: 1, limit: 20 });

      expect(result.items).toEqual(follows);
      expect(result.meta.total).toBe(1);
    });

    it('defaults page and limit when not provided', async () => {
      (storeFollowersRepository.findManyByUserId as jest.Mock).mockResolvedValue({
        follows: [],
        total: 0,
      });

      const result = await storesService.getMyFollowedStores(userId, {});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('createReview', () => {
    const raterId = 'rater-1';
    const reviewInput = { score: 5, comment: 'Great store' };

    it('throws NotFoundError when the store does not exist', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(storesService.createReview(raterId, storeId, reviewInput)).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws NotFoundError when the store is not ACTIVE', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue({ ...mockStore, status: 'PENDING' });

      await expect(storesService.createReview(raterId, storeId, reviewInput)).rejects.toThrow(
        'Store not found'
      );
    });

    it('throws NotFoundError when the seller profile behind the store is missing', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(storesService.createReview(raterId, storeId, reviewInput)).rejects.toThrow(
        'Seller not found'
      );
    });

    it('throws ForbiddenError when the rater owns the store', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({ id: sellerProfileId, userId: raterId });

      await expect(storesService.createReview(raterId, storeId, reviewInput)).rejects.toThrow(
        'You cannot review your own store.'
      );
    });

    it('throws ConflictError when the rater already reviewed this store', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({
        id: sellerProfileId,
        userId: 'someone-else',
      });
      (storeReviewsRepository.findBySellerAndRater as jest.Mock).mockResolvedValue({ id: 'rev-1' });

      await expect(storesService.createReview(raterId, storeId, reviewInput)).rejects.toThrow(
        ConflictError
      );
    });

    it('creates the review and recomputes the seller rating aggregate inside a transaction', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({
        id: sellerProfileId,
        userId: 'someone-else',
      });
      (storeReviewsRepository.findBySellerAndRater as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb({}));
      (storeReviewsRepository.create as jest.Mock).mockResolvedValue({ id: 'rev-1' });
      (sellersRepository.recomputeRatingAggregate as jest.Mock).mockResolvedValue(undefined);

      await storesService.createReview(raterId, storeId, reviewInput);

      expect(storeReviewsRepository.create).toHaveBeenCalledWith(
        {},
        {
          sellerProfileId,
          raterId,
          score: reviewInput.score,
          comment: reviewInput.comment,
        }
      );
      expect(sellersRepository.recomputeRatingAggregate).toHaveBeenCalledWith({}, sellerProfileId);
    });

    it('translates a P2002 unique-constraint race into ConflictError', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({
        id: sellerProfileId,
        userId: 'someone-else',
      });
      (storeReviewsRepository.findBySellerAndRater as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockRejectedValue({ code: 'P2002' });

      await expect(storesService.createReview(raterId, storeId, reviewInput)).rejects.toThrow(
        ConflictError
      );
    });

    it('rethrows unrelated transaction errors unchanged', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (sellersRepository.findById as jest.Mock).mockResolvedValue({
        id: sellerProfileId,
        userId: 'someone-else',
      });
      (storeReviewsRepository.findBySellerAndRater as jest.Mock).mockResolvedValue(null);
      const dbError = new Error('connection lost');
      (prisma.$transaction as jest.Mock).mockRejectedValue(dbError);

      await expect(storesService.createReview(raterId, storeId, reviewInput)).rejects.toThrow(
        'connection lost'
      );
    });
  });

  describe('getStoreReviews', () => {
    it('throws NotFoundError when the store does not exist', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(storesService.getStoreReviews(storeId, {})).rejects.toThrow(NotFoundError);
    });

    it('fetches reviews scoped by the store sellerProfileId and builds pagination meta', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      const reviews = [{ id: 'rev-1' }];
      (storeReviewsRepository.findManyBySellerProfileId as jest.Mock).mockResolvedValue({
        reviews,
        total: 1,
      });

      const result = await storesService.getStoreReviews(storeId, { page: 1, limit: 20 });

      expect(storeReviewsRepository.findManyBySellerProfileId).toHaveBeenCalledWith(
        sellerProfileId,
        { page: 1, limit: 20 }
      );
      expect(result.items).toEqual(reviews);
      expect(result.meta.total).toBe(1);
    });

    it('defaults page and limit when not provided in the query', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      (storeReviewsRepository.findManyBySellerProfileId as jest.Mock).mockResolvedValue({
        reviews: [],
        total: 0,
      });

      const result = await storesService.getStoreReviews(storeId, {});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('requireOwnStoreForProducts export', () => {
    it('is the same underlying logic used internally (throws BadRequestError with no seller profile)', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);

      await expect(requireOwnStoreForProducts(userId)).rejects.toThrow(
        'You need a seller profile first.'
      );
    });

    it('returns the store when the user owns one', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockStore);

      const result = await requireOwnStoreForProducts(userId);

      expect(result).toEqual(mockStore);
    });
  });
});
