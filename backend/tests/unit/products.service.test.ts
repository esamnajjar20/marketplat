import { productsService } from '../../src/modules/products/products.service';
import { productsRepository } from '../../src/modules/products/products.repository';
import { productCategoriesRepository } from '../../src/modules/product-categories/product-categories.repository';
import { storesRepository } from '../../src/modules/stores/stores.repository';
import { storeFollowersRepository } from '../../src/modules/stores/store-followers.repository';
import { requireOwnStoreForProducts } from '../../src/modules/stores/stores.service';
import { notificationEvents } from '../../src/modules/notifications/notifications.service';
import { prisma } from '../../src/config/prisma';
import { uploadImage, deleteImage } from '../../src/config/cloudinary';
import { cleanupUploadedImages, extractCloudinaryPublicId } from '../../src/shared/utils/cloudinaryHelpers';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/products/products.repository');
jest.mock('../../src/modules/product-categories/product-categories.repository');
jest.mock('../../src/modules/stores/stores.repository');
jest.mock('../../src/modules/stores/store-followers.repository');
jest.mock('../../src/modules/stores/stores.service');
jest.mock('../../src/modules/notifications/notifications.service');
jest.mock('../../src/config/cloudinary');
jest.mock('../../src/shared/utils/cloudinaryHelpers');

const mockActiveStore = { id: 'store-1', status: 'ACTIVE', plan: 'FREE', name: 'My Store' };
const mockCategory = { id: 'cat-1', isActive: true };

const validInput = {
  categoryId: 'cat-1',
  name: 'Phone',
  description: 'A long enough description',
  price: 100,
  availability: 'IN_STOCK' as const,
};

describe('productsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storeFollowersRepository.findUserIdsByStoreId as jest.Mock).mockResolvedValue([]);
    (notificationEvents.onStoreNewProduct as jest.Mock).mockResolvedValue({ count: 0 });
  });

  describe('createProduct', () => {
    beforeEach(() => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (uploadImage as jest.Mock).mockResolvedValue({ url: 'http://img', publicId: 'pub-1' });
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (productsRepository.create as jest.Mock).mockResolvedValue({ id: 'product-1' });
    });

    it('creates the product when the store is ACTIVE and the category is valid', async () => {
      const result = await productsService.createProduct('user-1', validInput, []);
      expect(result).toEqual({ id: 'product-1' });
      expect(productsRepository.create).toHaveBeenCalled();
    });

    it('rejects when the store is not yet ACTIVE', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue({
        ...mockActiveStore,
        status: 'PENDING',
      });

      await expect(productsService.createProduct('user-1', validInput, [])).rejects.toThrow(
        ForbiddenError
      );
      expect(productsRepository.create).not.toHaveBeenCalled();
    });

    it('rejects when the category does not exist', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(productsService.createProduct('user-1', validInput, [])).rejects.toThrow(
        BadRequestError
      );
      expect(productsRepository.create).not.toHaveBeenCalled();
    });

    it('rejects when the category is inactive', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        isActive: false,
      });

      await expect(productsService.createProduct('user-1', validInput, [])).rejects.toThrow(
        BadRequestError
      );
    });

    it('enforces the FREE plan product limit', async () => {
      (storesRepository.countActiveProducts as jest.Mock).mockResolvedValue(20);

      await expect(productsService.createProduct('user-1', validInput, [])).rejects.toThrow(
        BadRequestError
      );
      expect(productsRepository.create).not.toHaveBeenCalled();
    });

    it('allows creation under the FREE plan limit', async () => {
      (storesRepository.countActiveProducts as jest.Mock).mockResolvedValue(19);

      const result = await productsService.createProduct('user-1', validInput, []);
      expect(result).toEqual({ id: 'product-1' });
    });

    it('does not check the plan limit for non-FREE plans', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue({
        ...mockActiveStore,
        plan: 'PREMIUM',
      });

      await productsService.createProduct('user-1', validInput, []);
      expect(storesRepository.countActiveProducts).not.toHaveBeenCalled();
    });

    it('rejects when more than the max allowed images are uploaded', async () => {
      const files = Array.from({ length: 11 }, () => ({ buffer: Buffer.from('x') })) as any;

      await expect(productsService.createProduct('user-1', validInput, files)).rejects.toThrow(
        BadRequestError
      );
      expect(uploadImage).not.toHaveBeenCalled();
    });

    it('uploads each file and stores their URLs', async () => {
      const files = [{ buffer: Buffer.from('a') }, { buffer: Buffer.from('b') }] as any;
      (uploadImage as jest.Mock)
        .mockResolvedValueOnce({ url: 'http://img1', publicId: 'pub-1' })
        .mockResolvedValueOnce({ url: 'http://img2', publicId: 'pub-2' });

      await productsService.createProduct('user-1', validInput, files);

      expect(uploadImage).toHaveBeenCalledTimes(2);
      const createCall = (productsRepository.create as jest.Mock).mock.calls[0];
      expect(createCall[2].images).toEqual(['http://img1', 'http://img2']);
    });

    it('cleans up uploaded images and rethrows if the transaction fails', async () => {
      const dbError = new Error('db failure');
      (prisma.$transaction as jest.Mock) = jest.fn().mockRejectedValue(dbError);

      await expect(productsService.createProduct('user-1', validInput, [])).rejects.toThrow(
        'db failure'
      );
      expect(cleanupUploadedImages).toHaveBeenCalledWith(['pub-1']);
    });

    it('fans out a new-product notification to store followers without failing creation', async () => {
      (storeFollowersRepository.findUserIdsByStoreId as jest.Mock).mockResolvedValue([
        'follower-1',
        'follower-2',
      ]);

      await productsService.createProduct('user-1', validInput, []);
      // allow the fire-and-forget promise chain to flush
      await new Promise(process.nextTick);

      expect(storeFollowersRepository.findUserIdsByStoreId).toHaveBeenCalledWith('store-1');
    });

    it('does not fail product creation if the follower notification fan-out rejects', async () => {
      (storeFollowersRepository.findUserIdsByStoreId as jest.Mock).mockRejectedValue(
        new Error('redis down')
      );

      await expect(
        productsService.createProduct('user-1', validInput, [])
      ).resolves.toEqual({ id: 'product-1' });
    });
  });

  describe('getMyProducts', () => {
    it('returns paginated items scoped to the caller\'s own store', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findManyByStoreId as jest.Mock).mockResolvedValue({
        products: [{ id: 'product-1' }],
        total: 1,
      });

      const result = await productsService.getMyProducts('user-1', {});

      expect(productsRepository.findManyByStoreId).toHaveBeenCalledWith('store-1', {});
      expect(result.items).toEqual([{ id: 'product-1' }]);
      expect(result.meta.total).toBe(1);
    });

    it('defaults page and limit for the pagination meta', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findManyByStoreId as jest.Mock).mockResolvedValue({
        products: [],
        total: 0,
      });

      const result = await productsService.getMyProducts('user-1', {});
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('getProducts', () => {
    it('returns paginated public products', async () => {
      (productsRepository.findMany as jest.Mock).mockResolvedValue({
        products: [{ id: 'product-1' }],
        total: 1,
      });

      const result = await productsService.getProducts({ page: 2, limit: 5 } as any);

      expect(productsRepository.findMany).toHaveBeenCalledWith({ page: 2, limit: 5 });
      expect(result.items).toEqual([{ id: 'product-1' }]);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(5);
    });
  });

  describe('getProductById', () => {
    it('returns the product and fires a view-count increment', async () => {
      (productsRepository.findPublicById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        status: 'ACTIVE',
      });
      (productsRepository.incrementViews as jest.Mock).mockResolvedValue({});

      const result = await productsService.getProductById('product-1');

      expect(result).toEqual({ id: 'product-1', status: 'ACTIVE' });
      expect(productsRepository.incrementViews).toHaveBeenCalledWith('product-1');
    });

    it('throws NotFoundError when the product does not exist', async () => {
      (productsRepository.findPublicById as jest.Mock).mockResolvedValue(null);

      await expect(productsService.getProductById('missing')).rejects.toThrow(NotFoundError);
      expect(productsRepository.incrementViews).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the product is soft-deleted', async () => {
      (productsRepository.findPublicById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        status: 'DELETED',
      });

      await expect(productsService.getProductById('product-1')).rejects.toThrow(NotFoundError);
      expect(productsRepository.incrementViews).not.toHaveBeenCalled();
    });

    it('does not fail the read if the view-count increment rejects', async () => {
      (productsRepository.findPublicById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        status: 'ACTIVE',
      });
      (productsRepository.incrementViews as jest.Mock).mockRejectedValue(new Error('db down'));

      await expect(productsService.getProductById('product-1')).resolves.toEqual({
        id: 'product-1',
        status: 'ACTIVE',
      });
    });
  });

  describe('updateProduct — ownership / IDOR', () => {
    it('rejects updating a product owned by a different store', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        storeId: 'someone-elses-store',
      });

      await expect(
        productsService.updateProduct('user-1', 'product-1', {})
      ).rejects.toThrow(ForbiddenError);
      expect(productsRepository.update).not.toHaveBeenCalled();
    });

    it('allows updating a product the caller actually owns', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        storeId: 'store-1',
      });
      (productsRepository.update as jest.Mock).mockResolvedValue({ id: 'product-1' });

      const result = await productsService.updateProduct('user-1', 'product-1', {
        name: 'New name',
      });
      expect(result).toEqual({ id: 'product-1' });
    });

    it('throws NotFoundError for a nonexistent product', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        productsService.updateProduct('user-1', 'missing', {})
      ).rejects.toThrow(NotFoundError);
    });

    it('validates the new categoryId when one is provided', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        storeId: 'store-1',
      });
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        productsService.updateProduct('user-1', 'product-1', { categoryId: 'bad-cat' })
      ).rejects.toThrow(BadRequestError);
      expect(productsRepository.update).not.toHaveBeenCalled();
    });

    it('rejects an inactive categoryId on update', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        storeId: 'store-1',
      });
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue({
        id: 'cat-2',
        isActive: false,
      });

      await expect(
        productsService.updateProduct('user-1', 'product-1', { categoryId: 'cat-2' })
      ).rejects.toThrow(BadRequestError);
    });

    it('skips category validation when categoryId is not part of the update', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        storeId: 'store-1',
      });
      (productsRepository.update as jest.Mock).mockResolvedValue({ id: 'product-1' });

      await productsService.updateProduct('user-1', 'product-1', { name: 'New name' });
      expect(productCategoriesRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('deleteProduct — ownership / IDOR', () => {
    it('rejects deleting a product owned by a different store', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        storeId: 'someone-elses-store',
        images: [],
      });

      await expect(
        productsService.deleteProduct('user-1', 'product-1')
      ).rejects.toThrow(ForbiddenError);
      expect(productsRepository.softDelete).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a nonexistent product', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        productsService.deleteProduct('user-1', 'missing')
      ).rejects.toThrow(NotFoundError);
    });

    it('soft-deletes and cleans up associated cloudinary images', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        storeId: 'store-1',
        images: ['http://img/a.jpg', 'http://img/b.jpg'],
      });
      (productsRepository.softDelete as jest.Mock).mockResolvedValue({});
      (extractCloudinaryPublicId as jest.Mock)
        .mockReturnValueOnce('pub-a')
        .mockReturnValueOnce('pub-b');
      (deleteImage as jest.Mock).mockResolvedValue({});

      await productsService.deleteProduct('user-1', 'product-1');

      expect(productsRepository.softDelete).toHaveBeenCalledWith('product-1');
      expect(deleteImage).toHaveBeenCalledWith('pub-a');
      expect(deleteImage).toHaveBeenCalledWith('pub-b');
    });

    it('skips deleteImage for images with no extractable publicId', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        storeId: 'store-1',
        images: ['not-a-cloudinary-url'],
      });
      (productsRepository.softDelete as jest.Mock).mockResolvedValue({});
      (extractCloudinaryPublicId as jest.Mock).mockReturnValue(null);

      await productsService.deleteProduct('user-1', 'product-1');

      expect(deleteImage).not.toHaveBeenCalled();
    });

    it('does not fail deletion if a cloudinary deleteImage call rejects', async () => {
      (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(mockActiveStore);
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'product-1',
        storeId: 'store-1',
        images: ['http://img/a.jpg'],
      });
      (productsRepository.softDelete as jest.Mock).mockResolvedValue({});
      (extractCloudinaryPublicId as jest.Mock).mockReturnValue('pub-a');
      (deleteImage as jest.Mock).mockRejectedValue(new Error('cloudinary down'));

      await expect(
        productsService.deleteProduct('user-1', 'product-1')
      ).resolves.toBeUndefined();
    });
  });
});
