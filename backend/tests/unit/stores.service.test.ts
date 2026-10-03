import { storesService, requireOwnStoreForProducts } from '../../src/modules/stores/stores.service';
import { storesRepository } from '../../src/modules/stores/stores.repository';
import { storeFollowersRepository } from '../../src/modules/stores/store-followers.repository';
import { storeReviewsRepository } from '../../src/modules/stores/store-reviews.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { promotionsRepository } from '../../src/modules/promotions/promotions.repository';
import { productsRepository } from '../../src/modules/products/products.repository';
import { prisma } from '../../src/config/prisma';
import { Prisma } from '@prisma/client';
import { withStoreCreationLock } from '../../src/shared/utils/storeLock';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { storeTypesRepository } from '../../src/modules/store-types/store-types.repository';

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
// STORE-ANALYTICS (Foundation v1): getMyStoreAnalytics pulls from these
// two — mocked the same way every other cross-module repository
// dependency in this file already is, so real Prisma calls (which
// this file's manual prisma mock below doesn't define model methods
// for) never execute.
jest.mock('../../src/modules/promotions/promotions.repository');
jest.mock('../../src/modules/products/products.repository');
jest.mock('../../src/modules/store-types/store-types.repository');
jest.mock('../../src/shared/utils/publicListCache', () => ({
  bumpPublicListCache: jest.fn().mockResolvedValue(undefined),
  hidePublicEntities: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/config/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    userBlock: { count: jest.fn().mockResolvedValue(0) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
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
  // SEC-FIX: getPublicStore/getStoreReviews now both read
  // store.sellerProfile.suspended off the fetched store — included here
  // so every existing test using this shared fixture keeps working
  // without each one having to add it individually.
  sellerProfile: mockSellerProfile,
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
    // STORE-VIEWS: getPublicStore calls this fire-and-forget and chains
    // .catch() directly onto the return value (not awaited) — the
    // auto-mocked default (a jest.fn() returning undefined) isn't
    // thenable, so calling .catch() on it would throw synchronously
    // inside getPublicStore before it ever reaches its own return.
    // Every test that exercises getPublicStore's success path needs
    // this to actually return a promise, so it's set once here rather
    // than repeated per test.
    (storesRepository.incrementViews as jest.Mock).mockResolvedValue({} as any);
    (storeTypesRepository.findById as jest.Mock).mockResolvedValue({
      id: 'st_general',
      slug: 'general',
      nameAr: 'عام',
      icon: 'Store',
      labels: {
        products: 'المنتجات',
        product: 'منتج',
        addProduct: 'أضف منتجًا',
        categories: 'التصنيفات',
      },
      freeProductLimit: 20,
      isActive: true,
      sortOrder: 0,
    });
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
          storeTypeId: 'st_general',
        })
      );
    });

    it('rejects an inactive StoreType during creation', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      (storeTypesRepository.findById as jest.Mock).mockResolvedValue({
        id: 'st_pharmacy',
        isActive: false,
      });

      await expect(
        storesService.createStore(userId, { ...createInput, storeTypeId: 'st_pharmacy' }),
      ).rejects.toThrow(BadRequestError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
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

  describe('store type changes', () => {
    it('rejects owner type changes after activation', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockStore);

      await expect(
        storesService.updateMyStore(userId, { storeTypeId: 'st_pharmacy' } as any),
      ).rejects.toThrow(BadRequestError);
      expect(storesRepository.update).not.toHaveBeenCalled();
    });

    it('allows a pending owner to change to an active type', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue({
        ...mockStore,
        status: 'PENDING',
        storeTypeId: 'st_general',
      });
      (storeTypesRepository.findById as jest.Mock).mockResolvedValue({
        id: 'st_pharmacy',
        isActive: true,
      });
      (storesRepository.update as jest.Mock).mockResolvedValue({
        ...mockStore,
        status: 'PENDING',
        storeTypeId: 'st_pharmacy',
      });

      await storesService.updateMyStore(userId, { storeTypeId: 'st_pharmacy' } as any);

      expect(storesRepository.update).toHaveBeenCalledWith(
        storeId,
        expect.objectContaining({ storeTypeId: 'st_pharmacy' }),
      );
    });

    it('allows an admin to change an active store type and audits it', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue({
        ...mockStore,
        storeTypeId: 'st_general',
      });
      (storeTypesRepository.findById as jest.Mock).mockResolvedValue({
        id: 'st_pharmacy',
        isActive: true,
      });
      (storesRepository.updateStoreType as jest.Mock).mockResolvedValue({
        ...mockStore,
        storeTypeId: 'st_pharmacy',
      });

      const result = await storesService.updateStoreType(
        storeId,
        { storeTypeId: 'st_pharmacy' },
        'admin-1',
      );

      expect(result.storeTypeId).toBe('st_pharmacy');
      expect(storesRepository.updateStoreType).toHaveBeenCalledWith(storeId, 'st_pharmacy');
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

      // STORE-HOURS: isOpen is computed, not stored — null here because
      // publicStore has no workingHours field, same "unknown, not
      // closed" behavior computeIsOpen's own doc comment describes.
      expect(result).toEqual({ ...publicStore, isOpen: null });
    });

    // SEC-FIX regression: see stores.service.ts's getPublicStore comment
    // — findPublicById has no status filter of its own, so the service
    // must reject non-ACTIVE stores itself instead of trusting the
    // repository query, same as findMany/toggleFollow/createReview do.
    it('throws NotFoundError for a PENDING store', async () => {
      const pendingStore = { ...mockStore, status: 'PENDING', _count: { followers: 0, products: 0 } };
      (storesRepository.findPublicById as jest.Mock).mockResolvedValue(pendingStore);

      await expect(storesService.getPublicStore(storeId)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for a BLOCKED store', async () => {
      const blockedStore = { ...mockStore, status: 'BLOCKED', _count: { followers: 0, products: 0 } };
      (storesRepository.findPublicById as jest.Mock).mockResolvedValue(blockedStore);

      await expect(storesService.getPublicStore(storeId)).rejects.toThrow(NotFoundError);
    });

    // SEC-FIX regression: a suspended seller's store must 404 even
    // though the store's own status is still ACTIVE — setSuspension
    // never touches StoreDetails.status, only SellerProfile.suspended.
    it('throws NotFoundError when the seller is suspended', async () => {
      const suspendedSellerStore = {
        ...mockStore,
        sellerProfile: { ...mockSellerProfile, suspended: true },
        _count: { followers: 0, products: 0 },
      };
      (storesRepository.findPublicById as jest.Mock).mockResolvedValue(suspendedSellerStore);

      await expect(storesService.getPublicStore(storeId)).rejects.toThrow(NotFoundError);
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

      await expect(
        storesService.updateStoreStatus(storeId, { status: 'ACTIVE' }, 'admin-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('updates the store status when found', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(mockStore);
      const blocked = { ...mockStore, status: 'BLOCKED' };
      (storesRepository.updateStatus as jest.Mock).mockResolvedValue(blocked);

      const result = await storesService.updateStoreStatus(storeId, { status: 'BLOCKED' }, 'admin-1');

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
    // SEC-FIX: getStoreReviews now reads via findByIdWithSeller (not
    // the bare findById) so it can check both store.status and
    // store.sellerProfile.suspended before returning any reviews.
    it('throws NotFoundError when the store does not exist', async () => {
      (storesRepository.findByIdWithSeller as jest.Mock).mockResolvedValue(null);

      await expect(storesService.getStoreReviews(storeId, {})).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the store is not ACTIVE', async () => {
      (storesRepository.findByIdWithSeller as jest.Mock).mockResolvedValue({
        ...mockStore,
        status: 'PENDING',
      });

      await expect(storesService.getStoreReviews(storeId, {})).rejects.toThrow(NotFoundError);
    });

    // SEC-FIX regression: same gap as getPublicStore — a suspended
    // seller's reviews must not stay readable via this independent
    // endpoint just because the store's own status is still ACTIVE.
    it('throws NotFoundError when the seller is suspended', async () => {
      (storesRepository.findByIdWithSeller as jest.Mock).mockResolvedValue({
        ...mockStore,
        sellerProfile: { ...mockSellerProfile, suspended: true },
      });

      await expect(storesService.getStoreReviews(storeId, {})).rejects.toThrow(NotFoundError);
    });

    it('fetches reviews scoped by the store sellerProfileId and builds pagination meta', async () => {
      (storesRepository.findByIdWithSeller as jest.Mock).mockResolvedValue(mockStore);
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
      (storesRepository.findByIdWithSeller as jest.Mock).mockResolvedValue(mockStore);
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

  // STORE-ANALYTICS (Foundation v1)
  describe('getMyStoreAnalytics', () => {
    beforeEach(() => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue({
        ...mockStore,
        views: 150,
      });
    });

    it('throws BadRequestError when the caller has no store', async () => {
      (storesRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);

      await expect(storesService.getMyStoreAnalytics(userId)).rejects.toThrow(
        'You need to create your store first.'
      );
    });

    it('aggregates views, followers, promotions, and top products with no revenue/orders fields', async () => {
      (storeFollowersRepository.countByStoreId as jest.Mock).mockResolvedValue(42);
      (storeFollowersRepository.countByStoreIdSince as jest.Mock)
        .mockResolvedValueOnce(5) // 7d
        .mockResolvedValueOnce(12); // 30d
      (storesRepository.countActiveProducts as jest.Mock).mockResolvedValue(8);
      (promotionsRepository.findByStoreId as jest.Mock).mockResolvedValue([
        { status: 'ACTIVE', usageCount: 3 },
        { status: 'EXPIRED', usageCount: 7 },
      ]);
      (productsRepository.findTopByStoreId as jest.Mock).mockResolvedValue([
        { id: 'p1', name: 'Phone', views: 90, images: ['https://x/img1.jpg'] },
        { id: 'p2', name: 'Case', views: 40, images: [] },
      ]);

      const result = await storesService.getMyStoreAnalytics(userId);

      expect(result).toEqual({
        views: 150,
        followers: 42,
        newFollowers7d: 5,
        newFollowers30d: 12,
        activeProducts: 8,
        activePromotions: 1,
        promotionUses: 10,
        topProducts: [
          { id: 'p1', name: 'Phone', views: 90, image: 'https://x/img1.jpg' },
          { id: 'p2', name: 'Case', views: 40, image: null },
        ],
      });
      // Explicit, not just an absent-key check — this is the whole
      // point of the endpoint (see stores.service.ts's doc comment):
      // no honest orders/revenue/conversion number exists yet.
      expect(result).not.toHaveProperty('orders');
      expect(result).not.toHaveProperty('revenue');
      expect(result).not.toHaveProperty('conversionRate');
    });
  });
});
