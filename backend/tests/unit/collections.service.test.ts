/**
 * collections.service — previously 0 unit coverage.
 */
import { collectionsService } from '../../src/modules/collections/collections.service';
import { collectionsRepository } from '../../src/modules/collections/collections.repository';
import { productsRepository } from '../../src/modules/products/products.repository';
import { requireOwnStoreForProducts } from '../../src/modules/stores/stores.service';
import { storesRepository } from '../../src/modules/stores/stores.repository';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/collections/collections.repository');
jest.mock('../../src/modules/products/products.repository');
jest.mock('../../src/modules/stores/stores.service');
jest.mock('../../src/modules/stores/stores.repository');
jest.mock('../../src/shared/utils/slugify', () => ({
  generateStoreSlug: (name: string) =>
    name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') || 'collection',
  withSlugSuffix: (base: string) => `${base}-x`,
}));

const userId = 'user-1';
const store = { id: 'store-1', status: 'ACTIVE' };
const collection = {
  id: 'col-1',
  storeId: 'store-1',
  name: 'Summer',
  slug: 'summer',
  isActive: true,
};

describe('collectionsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireOwnStoreForProducts as jest.Mock).mockResolvedValue(store);
    (collectionsRepository.findBySlugInStore as jest.Mock).mockResolvedValue(null);
  });

  describe('createCollection', () => {
    it('creates with a unique slug derived from the name', async () => {
      (collectionsRepository.create as jest.Mock).mockResolvedValue({ ...collection, id: 'new' });

      const result = await collectionsService.createCollection(userId, {
        name: 'Summer Picks',
        description: 'desc',
      } as any);

      expect(collectionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: 'store-1',
          name: 'Summer Picks',
          slug: expect.any(String),
        }),
      );
      expect(result.id).toBe('new');
    });

    it('maps unique-constraint races to ConflictError', async () => {
      (collectionsRepository.create as jest.Mock).mockRejectedValue(new Error('unique'));
      (collectionsRepository.isUniqueConstraintError as jest.Mock).mockReturnValue(true);

      await expect(
        collectionsService.createCollection(userId, { name: 'Dup' } as any),
      ).rejects.toThrow(ConflictError);
    });

    it('rethrows non-unique create errors', async () => {
      const err = new Error('db down');
      (collectionsRepository.create as jest.Mock).mockRejectedValue(err);
      (collectionsRepository.isUniqueConstraintError as jest.Mock).mockReturnValue(false);

      await expect(
        collectionsService.createCollection(userId, { name: 'X' } as any),
      ).rejects.toThrow(err);
    });
  });

  describe('getMyCollections', () => {
    it('lists collections for the caller store', async () => {
      (collectionsRepository.findByStoreId as jest.Mock).mockResolvedValue([collection]);
      const result = await collectionsService.getMyCollections(userId);
      expect(result).toHaveLength(1);
      expect(collectionsRepository.findByStoreId).toHaveBeenCalledWith('store-1');
    });
  });

  describe('ownership helpers', () => {
    it('getCollectionById throws NotFound when missing', async () => {
      (collectionsRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(collectionsService.getCollectionById(userId, 'missing')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('getCollectionById throws Forbidden when store mismatch', async () => {
      (collectionsRepository.findById as jest.Mock).mockResolvedValue({
        ...collection,
        storeId: 'other-store',
      });
      await expect(collectionsService.getCollectionById(userId, 'col-1')).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  describe('updateCollection', () => {
    it('re-derives slug when the name changes', async () => {
      (collectionsRepository.findById as jest.Mock).mockResolvedValue(collection);
      (collectionsRepository.update as jest.Mock).mockResolvedValue({
        ...collection,
        name: 'Winter',
      });

      await collectionsService.updateCollection(userId, 'col-1', { name: 'Winter' } as any);

      expect(collectionsRepository.update).toHaveBeenCalledWith(
        'col-1',
        expect.objectContaining({ name: 'Winter', slug: expect.any(String) }),
      );
    });

    it('does not change slug when name is unchanged', async () => {
      (collectionsRepository.findById as jest.Mock).mockResolvedValue(collection);
      (collectionsRepository.update as jest.Mock).mockResolvedValue(collection);

      await collectionsService.updateCollection(userId, 'col-1', {
        name: 'Summer',
        description: 'x',
      } as any);

      expect(collectionsRepository.update).toHaveBeenCalledWith(
        'col-1',
        expect.objectContaining({ slug: undefined }),
      );
    });
  });

  describe('deleteCollection', () => {
    it('deletes after ownership check', async () => {
      (collectionsRepository.findById as jest.Mock).mockResolvedValue(collection);
      (collectionsRepository.delete as jest.Mock).mockResolvedValue(undefined);

      await collectionsService.deleteCollection(userId, 'col-1');
      expect(collectionsRepository.delete).toHaveBeenCalledWith('col-1');
    });
  });

  describe('reorderCollections', () => {
    it('rejects orderedIds that do not match owned set', async () => {
      (collectionsRepository.findByStoreId as jest.Mock).mockResolvedValue([
        collection,
        { ...collection, id: 'col-2' },
      ]);

      await expect(
        collectionsService.reorderCollections(userId, { orderedIds: ['col-1'] } as any),
      ).rejects.toThrow(BadRequestError);
    });

    it('reorders when orderedIds match exactly', async () => {
      (collectionsRepository.findByStoreId as jest.Mock).mockResolvedValue([
        collection,
        { ...collection, id: 'col-2' },
      ]);
      (collectionsRepository.reorder as jest.Mock).mockResolvedValue(undefined);

      await collectionsService.reorderCollections(userId, {
        orderedIds: ['col-2', 'col-1'],
      } as any);

      expect(collectionsRepository.reorder).toHaveBeenCalledWith('store-1', ['col-2', 'col-1']);
    });
  });

  describe('addProduct / removeProduct', () => {
    beforeEach(() => {
      (collectionsRepository.findById as jest.Mock).mockResolvedValue(collection);
    });

    it('throws NotFound when product is missing or DELETED', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(collectionsService.addProduct(userId, 'col-1', 'p1')).rejects.toThrow(
        NotFoundError,
      );

      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'p1',
        storeId: 'store-1',
        status: 'DELETED',
      });
      await expect(collectionsService.addProduct(userId, 'col-1', 'p1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws Forbidden when product belongs to another store', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'p1',
        storeId: 'other',
        status: 'ACTIVE',
      });
      await expect(collectionsService.addProduct(userId, 'col-1', 'p1')).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('no-ops when product is already a member', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'p1',
        storeId: 'store-1',
        status: 'ACTIVE',
      });
      (collectionsRepository.isMember as jest.Mock).mockResolvedValue(true);

      await collectionsService.addProduct(userId, 'col-1', 'p1');
      expect(collectionsRepository.addProduct).not.toHaveBeenCalled();
    });

    it('adds with next sort order when not a member', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'p1',
        storeId: 'store-1',
        status: 'ACTIVE',
      });
      (collectionsRepository.isMember as jest.Mock).mockResolvedValue(false);
      (collectionsRepository.nextSortOrder as jest.Mock).mockResolvedValue(3);
      (collectionsRepository.addProduct as jest.Mock).mockResolvedValue(undefined);

      await collectionsService.addProduct(userId, 'col-1', 'p1');
      expect(collectionsRepository.addProduct).toHaveBeenCalledWith('col-1', 'p1', 3);
    });

    it('removeProduct delegates after ownership check', async () => {
      (collectionsRepository.removeProduct as jest.Mock).mockResolvedValue(undefined);
      await collectionsService.removeProduct(userId, 'col-1', 'p1');
      expect(collectionsRepository.removeProduct).toHaveBeenCalledWith('col-1', 'p1');
    });
  });

  describe('public reads', () => {
    it('getPublicCollections resolves store by id then slug', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(null);
      (storesRepository.findBySlug as jest.Mock).mockResolvedValue(store);
      (collectionsRepository.findActiveByStoreId as jest.Mock).mockResolvedValue([collection]);

      const result = await collectionsService.getPublicCollections('my-slug');
      expect(result).toHaveLength(1);
      expect(collectionsRepository.findActiveByStoreId).toHaveBeenCalledWith('store-1');
    });

    it('getPublicCollections throws when store missing or inactive', async () => {
      (storesRepository.findById as jest.Mock).mockResolvedValue(null);
      (storesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      await expect(collectionsService.getPublicCollections('x')).rejects.toThrow(NotFoundError);

      (storesRepository.findById as jest.Mock).mockResolvedValue({ ...store, status: 'SUSPENDED' });
      await expect(collectionsService.getPublicCollections('store-1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('getPublicCollectionProducts throws when collection inactive', async () => {
      (collectionsRepository.findById as jest.Mock).mockResolvedValue({
        ...collection,
        isActive: false,
      });
      await expect(collectionsService.getPublicCollectionProducts('col-1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('getPublicCollectionProducts maps product rows', async () => {
      (collectionsRepository.findById as jest.Mock).mockResolvedValue(collection);
      (collectionsRepository.findVisibleProducts as jest.Mock).mockResolvedValue([
        { product: { id: 'p1', title: 'Item' } },
      ]);

      const products = await collectionsService.getPublicCollectionProducts('col-1');
      expect(products).toEqual([{ id: 'p1', title: 'Item' }]);
    });
  });
});
