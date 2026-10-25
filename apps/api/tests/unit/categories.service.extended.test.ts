import { categoriesService } from '../../src/modules/categories/categories.service';
import { categoriesRepository } from '../../src/modules/categories/categories.repository';
import { redis } from '../../src/config/redis';
import { Prisma } from '@prisma/client';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/categories/categories.repository');

const mockCategory = {
  id: 'cat-1',
  name: 'Electronics',
  nameAr: 'إلكترونيات',
  slug: 'electronics',
  parentId: null,
  createdAt: new Date(),
};

const makeP2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.0.0',
    meta: { target: ['slug'] },
  });

describe('CategoriesService — additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(redis, 'get').mockResolvedValue(null);
    jest.spyOn(redis, 'setex').mockResolvedValue('OK');
    jest.spyOn(redis, 'del').mockResolvedValue(1);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('createCategory — P2002 race', () => {
    it('translates a P2002 unique-constraint error from the repository into BadRequestError', async () => {
      (categoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.create as jest.Mock).mockRejectedValue(makeP2002());

      await expect(
        categoriesService.createCategory({ name: 'x', nameAr: 'y', slug: 'z' })
      ).rejects.toThrow('Category name or slug already exists');
    });

    it('rethrows a non-P2002 error from the repository unchanged', async () => {
      (categoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.create as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

      await expect(
        categoriesService.createCategory({ name: 'x', nameAr: 'y', slug: 'z' })
      ).rejects.toThrow('DB connection lost');
    });
  });

  describe('getCategories — cache write failure', () => {
    it('still returns the DB result when the cache write (setex) fails', async () => {
      jest.spyOn(redis, 'setex').mockRejectedValue(new Error('Redis down'));
      (categoriesRepository.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await categoriesService.getCategories();

      expect(result).toHaveLength(1);
    });
  });

  describe('updateCategory — unchanged-field skip checks', () => {
    it('does not re-check slug uniqueness when the new slug equals the current one', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.update as jest.Mock).mockResolvedValue(mockCategory);

      await categoriesService.updateCategory('cat-1', { slug: mockCategory.slug });

      expect(categoriesRepository.findBySlug).not.toHaveBeenCalled();
    });

    it('does not re-check name uniqueness when the new name equals the current one', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.update as jest.Mock).mockResolvedValue(mockCategory);

      await categoriesService.updateCategory('cat-1', { name: mockCategory.name });

      expect(categoriesRepository.findByName).not.toHaveBeenCalled();
    });

    it('does not re-check nameAr uniqueness when the new nameAr equals the current one', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.update as jest.Mock).mockResolvedValue(mockCategory);

      await categoriesService.updateCategory('cat-1', { nameAr: mockCategory.nameAr });

      expect(categoriesRepository.findByNameAr).not.toHaveBeenCalled();
    });

    it('invalidates the cache after a successful update', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.update as jest.Mock).mockResolvedValue({ ...mockCategory, name: 'New' });

      await categoriesService.updateCategory('cat-1', { name: 'New' });

      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe('updateCategory — P2002 race', () => {
    it('translates a P2002 unique-constraint error from the repository into BadRequestError', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.update as jest.Mock).mockRejectedValue(makeP2002());

      await expect(
        categoriesService.updateCategory('cat-1', { name: 'Totally New Name' })
      ).rejects.toThrow('Category name, Arabic name, or slug already exists');
    });

    it('rethrows a non-P2002 error from the repository unchanged', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.update as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

      await expect(
        categoriesService.updateCategory('cat-1', { name: 'Totally New Name' })
      ).rejects.toThrow('DB connection lost');
    });
  });

  describe('deleteCategory — cache invalidation', () => {
    it('invalidates the cache after a successful delete', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.countAds as jest.Mock).mockResolvedValue(0);
      (categoriesRepository.delete as jest.Mock).mockResolvedValue(undefined);

      await categoriesService.deleteCategory('cat-1');

      expect(redis.del).toHaveBeenCalled();
    });
  });
});
