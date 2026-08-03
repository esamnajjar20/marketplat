import { productCategoriesService } from '../../src/modules/product-categories/product-categories.service';
import { productCategoriesRepository } from '../../src/modules/product-categories/product-categories.repository';
import { redis } from '../../src/config/redis';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/product-categories/product-categories.repository');

const mockCategory = {
  id: 'cat-1',
  name: 'Electronics',
  nameAr: 'إلكترونيات',
  slug: 'electronics',
  icon: null,
  parentId: null,
  isActive: true,
  createdAt: new Date(),
} as any;

describe('productCategoriesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createProductCategory', () => {
    const input = { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' } as any;

    it('creates the category and invalidates the cache on success', async () => {
      (productCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.create as jest.Mock).mockResolvedValue(mockCategory);
      jest.spyOn(redis, 'del').mockResolvedValue(1);

      const result = await productCategoriesService.createProductCategory(input);

      expect(result).toEqual(mockCategory);
      expect(redis.del).toHaveBeenCalledWith('product_categories:all');
    });

    it('throws BadRequestError when the name already exists', async () => {
      (productCategoriesRepository.findByName as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);

      await expect(productCategoriesService.createProductCategory(input)).rejects.toThrow(
        'Product category name already exists'
      );
      expect(productCategoriesRepository.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when the Arabic name already exists', async () => {
      (productCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);

      await expect(productCategoriesService.createProductCategory(input)).rejects.toThrow(
        'Arabic product category name already exists'
      );
    });

    it('throws BadRequestError when the slug already exists', async () => {
      (productCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(mockCategory);

      await expect(productCategoriesService.createProductCategory(input)).rejects.toThrow(
        'Product category slug already exists'
      );
    });

    it('translates a P2002 race-condition error into BadRequestError', async () => {
      (productCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (productCategoriesRepository.create as jest.Mock).mockRejectedValue(err);

      await expect(productCategoriesService.createProductCategory(input)).rejects.toThrow(
        BadRequestError
      );
    });

    it('rethrows a non-P2002 error unchanged', async () => {
      (productCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      const err = new Prisma.PrismaClientKnownRequestError('Foreign key violation', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });
      (productCategoriesRepository.create as jest.Mock).mockRejectedValue(err);

      await expect(productCategoriesService.createProductCategory(input)).rejects.toThrow(
        'Foreign key violation'
      );
    });

    it('rethrows a plain (non-Prisma) error unchanged', async () => {
      (productCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      (productCategoriesRepository.create as jest.Mock).mockRejectedValue(
        new Error('connection reset')
      );

      await expect(productCategoriesService.createProductCategory(input)).rejects.toThrow(
        'connection reset'
      );
    });
  });

  describe('getProductCategories — cache branches', () => {
    it('returns the cached value on a cache hit, without querying the DB', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify([mockCategory]));

      const result = await productCategoriesService.getProductCategories();

      expect(result).toEqual(JSON.parse(JSON.stringify([mockCategory])));
      expect(productCategoriesRepository.findMany).not.toHaveBeenCalled();
    });

    it('queries the DB and writes through to cache on a cache miss', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(redis, 'setex').mockResolvedValue('OK');
      (productCategoriesRepository.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await productCategoriesService.getProductCategories();

      expect(result).toEqual([mockCategory]);
      expect(redis.setex).toHaveBeenCalledWith(
        'product_categories:all',
        3600,
        JSON.stringify([mockCategory])
      );
    });

    it('falls back to the DB when the cache read itself fails', async () => {
      jest.spyOn(redis, 'get').mockRejectedValue(new Error('redis down'));
      jest.spyOn(redis, 'setex').mockResolvedValue('OK');
      (productCategoriesRepository.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await productCategoriesService.getProductCategories();

      expect(result).toEqual([mockCategory]);
      expect(productCategoriesRepository.findMany).toHaveBeenCalled();
    });

    it('still returns the DB result even when the cache write-through fails', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(redis, 'setex').mockRejectedValue(new Error('redis down'));
      (productCategoriesRepository.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await productCategoriesService.getProductCategories();

      expect(result).toEqual([mockCategory]);
    });
  });

  describe('getProductCategoriesForAdmin', () => {
    it('delegates directly to the repository (no cache)', async () => {
      (productCategoriesRepository.findManyForAdmin as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await productCategoriesService.getProductCategoriesForAdmin();

      expect(result).toEqual([mockCategory]);
      expect(productCategoriesRepository.findManyForAdmin).toHaveBeenCalled();
    });
  });

  describe('getProductCategoryById', () => {
    it('returns the category when found', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      const result = await productCategoriesService.getProductCategoryById('cat-1');
      expect(result).toEqual(mockCategory);
    });

    it('throws NotFoundError when not found', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(productCategoriesService.getProductCategoryById('missing')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('getProductCategoryBySlug', () => {
    it('returns the category when found', async () => {
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(mockCategory);
      const result = await productCategoriesService.getProductCategoryBySlug('electronics');
      expect(result).toEqual(mockCategory);
    });

    it('throws NotFoundError when not found', async () => {
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      await expect(productCategoriesService.getProductCategoryBySlug('missing')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('updateProductCategory', () => {
    it('throws NotFoundError when the category does not exist', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(
        productCategoriesService.updateProductCategory('missing', { name: 'New Name' } as any)
      ).rejects.toThrow(NotFoundError);
    });

    it('updates successfully when no unique fields are changed', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.update as jest.Mock).mockResolvedValue({
        ...mockCategory,
        icon: 'phone-icon',
      });
      jest.spyOn(redis, 'del').mockResolvedValue(1);

      const result = await productCategoriesService.updateProductCategory('cat-1', {
        icon: 'phone-icon',
      } as any);

      expect(result.icon).toBe('phone-icon');
      expect(productCategoriesRepository.findBySlug).not.toHaveBeenCalled();
      expect(productCategoriesRepository.findByName).not.toHaveBeenCalled();
      expect(productCategoriesRepository.findByNameAr).not.toHaveBeenCalled();
    });

    it('allows updating slug to the same value it already has (no uniqueness check triggered)', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.update as jest.Mock).mockResolvedValue(mockCategory);
      jest.spyOn(redis, 'del').mockResolvedValue(1);

      await productCategoriesService.updateProductCategory('cat-1', {
        slug: 'electronics',
      } as any);

      expect(productCategoriesRepository.findBySlug).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when changing to a slug already used by another category', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'other-cat',
      });

      await expect(
        productCategoriesService.updateProductCategory('cat-1', { slug: 'other-slug' } as any)
      ).rejects.toThrow('Slug already in use');
    });

    it('throws BadRequestError when changing to a name already used by another category', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.findByName as jest.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'other-cat',
      });

      await expect(
        productCategoriesService.updateProductCategory('cat-1', { name: 'Other Name' } as any)
      ).rejects.toThrow('Product category name already in use');
    });

    it('throws BadRequestError when changing to an Arabic name already used by another category', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'other-cat',
      });

      await expect(
        productCategoriesService.updateProductCategory('cat-1', { nameAr: 'اسم آخر' } as any)
      ).rejects.toThrow('Arabic name already in use');
    });

    it('translates a P2002 race-condition error into BadRequestError', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (productCategoriesRepository.update as jest.Mock).mockRejectedValue(err);

      await expect(
        productCategoriesService.updateProductCategory('cat-1', { icon: 'phone-icon' } as any)
      ).rejects.toThrow(BadRequestError);
    });

    it('rethrows a non-P2002 error unchanged', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.update as jest.Mock).mockRejectedValue(
        new Error('connection reset')
      );

      await expect(
        productCategoriesService.updateProductCategory('cat-1', { icon: 'phone-icon' } as any)
      ).rejects.toThrow('connection reset');
    });
  });

  describe('deleteProductCategory', () => {
    it('throws NotFoundError when the category does not exist', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(productCategoriesService.deleteProductCategory('missing')).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws BadRequestError when active products still reference the category', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.countProducts as jest.Mock).mockResolvedValue(3);

      await expect(productCategoriesService.deleteProductCategory('cat-1')).rejects.toThrow(
        'Cannot delete category with 3 active products'
      );
      expect(productCategoriesRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes and invalidates the cache when there are no active products', async () => {
      (productCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (productCategoriesRepository.countProducts as jest.Mock).mockResolvedValue(0);
      (productCategoriesRepository.delete as jest.Mock).mockResolvedValue(undefined);
      jest.spyOn(redis, 'del').mockResolvedValue(1);

      await productCategoriesService.deleteProductCategory('cat-1');

      expect(productCategoriesRepository.delete).toHaveBeenCalledWith('cat-1');
      expect(redis.del).toHaveBeenCalledWith('product_categories:all');
    });
  });
});
