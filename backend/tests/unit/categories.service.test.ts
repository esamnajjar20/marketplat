import { categoriesService } from '../../src/modules/categories/categories.service';
import { categoriesRepository } from '../../src/modules/categories/categories.repository';
import { redis } from '../../src/config/redis';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/categories/categories.repository');

const mockCategory = {
  id: 'cat-1',
  name: 'Electronics',
  nameAr: 'إلكترونيات',
  slug: 'electronics',
  parentId: null,
  createdAt: new Date(),
};

describe('CategoriesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(redis, 'get').mockResolvedValue(null);
    jest.spyOn(redis, 'setex').mockResolvedValue('OK');
    jest.spyOn(redis, 'del').mockResolvedValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createCategory', () => {
    it('creates category and invalidates cache', async () => {
      (categoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.create as jest.Mock).mockResolvedValue(mockCategory);

      const result = await categoriesService.createCategory({
        name: 'Electronics',
        nameAr: 'إلكترونيات',
        slug: 'electronics',
      });

      expect(result.slug).toBe('electronics');
      expect(redis.del).toHaveBeenCalled();
    });

    it('throws when name exists', async () => {
      (categoriesRepository.findByName as jest.Mock).mockResolvedValue(mockCategory);
      await expect(
        categoriesService.createCategory({ name: 'Electronics', nameAr: 'x', slug: 'x' })
      ).rejects.toThrow(BadRequestError);
    });

    it('throws when Arabic name exists', async () => {
      (categoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(mockCategory);
      await expect(
        categoriesService.createCategory({ name: 'x', nameAr: 'إلكترونيات', slug: 'x' })
      ).rejects.toThrow('Arabic category name already exists');
    });

    it('throws when slug exists', async () => {
      (categoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (categoriesRepository.findBySlug as jest.Mock).mockResolvedValue(mockCategory);
      await expect(
        categoriesService.createCategory({ name: 'x', nameAr: 'y', slug: 'electronics' })
      ).rejects.toThrow('Category slug already exists');
    });
  });

  describe('getCategories', () => {
    it('returns cached categories when available', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify([mockCategory]));

      const result = await categoriesService.getCategories();
      expect(result).toHaveLength(1);
      expect(categoriesRepository.findMany).not.toHaveBeenCalled();
    });

    it('falls back to DB on cache miss', async () => {
      (categoriesRepository.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await categoriesService.getCategories();
      expect(result).toHaveLength(1);
      expect(redis.setex).toHaveBeenCalled();
    });

    it('falls back to DB when cache read fails', async () => {
      jest.spyOn(redis, 'get').mockRejectedValue(new Error('Redis down'));
      (categoriesRepository.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await categoriesService.getCategories();
      expect(result).toHaveLength(1);
    });
  });

  describe('getCategoryById', () => {
    it('returns category when found', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      const result = await categoriesService.getCategoryById('cat-1');
      expect(result.id).toBe('cat-1');
    });

    it('throws NotFoundError when missing', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(categoriesService.getCategoryById('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateCategory', () => {
    it('throws when slug conflict', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.findBySlug as jest.Mock).mockResolvedValue({ ...mockCategory, id: 'other' });

      await expect(
        categoriesService.updateCategory('cat-1', { slug: 'taken-slug' })
      ).rejects.toThrow('Slug already in use');
    });

    it('updates successfully', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.update as jest.Mock).mockResolvedValue({ ...mockCategory, name: 'Updated' });

      const result = await categoriesService.updateCategory('cat-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('throws when name conflict', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.findByName as jest.Mock).mockResolvedValue({ ...mockCategory, id: 'other' });

      await expect(categoriesService.updateCategory('cat-1', { name: 'Taken' })).rejects.toThrow(
        'Category name already in use'
      );
    });

    it('throws when Arabic name conflict', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.findByNameAr as jest.Mock).mockResolvedValue({ ...mockCategory, id: 'other' });

      await expect(categoriesService.updateCategory('cat-1', { nameAr: 'مأخوذ' })).rejects.toThrow(
        'Arabic name already in use'
      );
    });
  });

  describe('getCategoryBySlug', () => {
    it('returns category when found', async () => {
      (categoriesRepository.findBySlug as jest.Mock).mockResolvedValue(mockCategory);
      const result = await categoriesService.getCategoryBySlug('electronics');
      expect(result.slug).toBe('electronics');
    });

    it('throws when slug not found', async () => {
      (categoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      await expect(categoriesService.getCategoryBySlug('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteCategory', () => {
    it('throws when category has ads', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.countAds as jest.Mock).mockResolvedValue(3);

      await expect(categoriesService.deleteCategory('cat-1')).rejects.toThrow(/active ads/);
    });

    it('deletes empty category', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (categoriesRepository.countAds as jest.Mock).mockResolvedValue(0);
      (categoriesRepository.delete as jest.Mock).mockResolvedValue(undefined);

      await expect(categoriesService.deleteCategory('cat-1')).resolves.toBeUndefined();
    });

    it('throws when category missing', async () => {
      (categoriesRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(categoriesService.deleteCategory('missing')).rejects.toThrow(NotFoundError);
    });
  });
});
