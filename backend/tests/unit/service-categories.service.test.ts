import { serviceCategoriesService } from '../../src/modules/service-categories/service-categories.service';
import { serviceCategoriesRepository } from '../../src/modules/service-categories/service-categories.repository';
import { redis } from '../../src/config/redis';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/service-categories/service-categories.repository');

const mockCategory = {
  id: 'cat-1',
  name: 'Plumbing',
  nameAr: 'سباكة',
  slug: 'plumbing',
  icon: null,
  parentId: null,
  isActive: true,
  createdAt: new Date(),
} as any;

describe('serviceCategoriesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createServiceCategory', () => {
    const input = { name: 'Plumbing', nameAr: 'سباكة', slug: 'plumbing' } as any;

    it('creates the category and invalidates the cache on success', async () => {
      (serviceCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.create as jest.Mock).mockResolvedValue(mockCategory);
      jest.spyOn(redis, 'del').mockResolvedValue(1);

      const result = await serviceCategoriesService.createServiceCategory(input);

      expect(result).toEqual(mockCategory);
      expect(redis.del).toHaveBeenCalledWith('service_categories:all');
    });

    it('throws BadRequestError when the name already exists', async () => {
      (serviceCategoriesRepository.findByName as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);

      await expect(serviceCategoriesService.createServiceCategory(input)).rejects.toThrow(
        'Service category name already exists'
      );
      expect(serviceCategoriesRepository.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when the Arabic name already exists', async () => {
      (serviceCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);

      await expect(serviceCategoriesService.createServiceCategory(input)).rejects.toThrow(
        'Arabic service category name already exists'
      );
    });

    it('throws BadRequestError when the slug already exists', async () => {
      (serviceCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(mockCategory);

      await expect(serviceCategoriesService.createServiceCategory(input)).rejects.toThrow(
        'Service category slug already exists'
      );
    });

    it('translates a P2002 race-condition error into BadRequestError', async () => {
      (serviceCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (serviceCategoriesRepository.create as jest.Mock).mockRejectedValue(err);

      await expect(serviceCategoriesService.createServiceCategory(input)).rejects.toThrow(
        BadRequestError
      );
    });

    it('rethrows a non-P2002 error unchanged', async () => {
      (serviceCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      const err = new Prisma.PrismaClientKnownRequestError('Foreign key violation', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });
      (serviceCategoriesRepository.create as jest.Mock).mockRejectedValue(err);

      await expect(serviceCategoriesService.createServiceCategory(input)).rejects.toThrow(
        'Foreign key violation'
      );
    });

    it('rethrows a plain (non-Prisma) error unchanged', async () => {
      (serviceCategoriesRepository.findByName as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      (serviceCategoriesRepository.create as jest.Mock).mockRejectedValue(
        new Error('connection reset')
      );

      await expect(serviceCategoriesService.createServiceCategory(input)).rejects.toThrow(
        'connection reset'
      );
    });
  });

  describe('getServiceCategories — cache branches', () => {
    it('returns the cached value on a cache hit, without querying the DB', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify([mockCategory]));

      const result = await serviceCategoriesService.getServiceCategories();

      expect(result).toEqual(JSON.parse(JSON.stringify([mockCategory])));
      expect(serviceCategoriesRepository.findMany).not.toHaveBeenCalled();
    });

    it('queries the DB and writes through to cache on a cache miss', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(redis, 'setex').mockResolvedValue('OK');
      (serviceCategoriesRepository.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await serviceCategoriesService.getServiceCategories();

      expect(result).toEqual([mockCategory]);
      expect(redis.setex).toHaveBeenCalledWith(
        'service_categories:all',
        3600,
        JSON.stringify([mockCategory])
      );
    });

    it('falls back to the DB when the cache read itself fails', async () => {
      jest.spyOn(redis, 'get').mockRejectedValue(new Error('redis down'));
      jest.spyOn(redis, 'setex').mockResolvedValue('OK');
      (serviceCategoriesRepository.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await serviceCategoriesService.getServiceCategories();

      expect(result).toEqual([mockCategory]);
      expect(serviceCategoriesRepository.findMany).toHaveBeenCalled();
    });

    it('still returns the DB result even when the cache write-through fails', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(redis, 'setex').mockRejectedValue(new Error('redis down'));
      (serviceCategoriesRepository.findMany as jest.Mock).mockResolvedValue([mockCategory]);

      const result = await serviceCategoriesService.getServiceCategories();

      expect(result).toEqual([mockCategory]);
    });
  });

  describe('getServiceCategoryById', () => {
    it('returns the category when found', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      const result = await serviceCategoriesService.getServiceCategoryById('cat-1');
      expect(result).toEqual(mockCategory);
    });

    it('throws NotFoundError when not found', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(serviceCategoriesService.getServiceCategoryById('missing')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('getServiceCategoryBySlug', () => {
    it('returns the category when found', async () => {
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(mockCategory);
      const result = await serviceCategoriesService.getServiceCategoryBySlug('plumbing');
      expect(result).toEqual(mockCategory);
    });

    it('throws NotFoundError when not found', async () => {
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue(null);
      await expect(serviceCategoriesService.getServiceCategoryBySlug('missing')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('updateServiceCategory', () => {
    it('throws NotFoundError when the category does not exist', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(
        serviceCategoriesService.updateServiceCategory('missing', { name: 'New Name' } as any)
      ).rejects.toThrow(NotFoundError);
    });

    it('updates successfully when no unique fields are changed', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.update as jest.Mock).mockResolvedValue({
        ...mockCategory,
        icon: 'wrench',
      });
      jest.spyOn(redis, 'del').mockResolvedValue(1);

      const result = await serviceCategoriesService.updateServiceCategory('cat-1', {
        icon: 'wrench',
      } as any);

      expect(result.icon).toBe('wrench');
      expect(serviceCategoriesRepository.findBySlug).not.toHaveBeenCalled();
      expect(serviceCategoriesRepository.findByName).not.toHaveBeenCalled();
      expect(serviceCategoriesRepository.findByNameAr).not.toHaveBeenCalled();
    });

    it('allows updating slug to the same value it already has (no uniqueness check triggered)', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.update as jest.Mock).mockResolvedValue(mockCategory);
      jest.spyOn(redis, 'del').mockResolvedValue(1);

      await serviceCategoriesService.updateServiceCategory('cat-1', { slug: 'plumbing' } as any);

      expect(serviceCategoriesRepository.findBySlug).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when changing to a slug already used by another category', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.findBySlug as jest.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'other-cat',
      });

      await expect(
        serviceCategoriesService.updateServiceCategory('cat-1', { slug: 'other-slug' } as any)
      ).rejects.toThrow('Slug already in use');
    });

    it('throws BadRequestError when changing to a name already used by another category', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.findByName as jest.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'other-cat',
      });

      await expect(
        serviceCategoriesService.updateServiceCategory('cat-1', { name: 'Other Name' } as any)
      ).rejects.toThrow('Service category name already in use');
    });

    it('throws BadRequestError when changing to an Arabic name already used by another category', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.findByNameAr as jest.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'other-cat',
      });

      await expect(
        serviceCategoriesService.updateServiceCategory('cat-1', { nameAr: 'اسم آخر' } as any)
      ).rejects.toThrow('Arabic name already in use');
    });

    it('translates a P2002 race-condition error into BadRequestError', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (serviceCategoriesRepository.update as jest.Mock).mockRejectedValue(err);

      await expect(
        serviceCategoriesService.updateServiceCategory('cat-1', { icon: 'wrench' } as any)
      ).rejects.toThrow(BadRequestError);
    });

    it('rethrows a non-P2002 error unchanged', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.update as jest.Mock).mockRejectedValue(
        new Error('connection reset')
      );

      await expect(
        serviceCategoriesService.updateServiceCategory('cat-1', { icon: 'wrench' } as any)
      ).rejects.toThrow('connection reset');
    });
  });

  describe('deleteServiceCategory', () => {
    it('throws NotFoundError when the category does not exist', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(serviceCategoriesService.deleteServiceCategory('missing')).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws BadRequestError when active listings still reference the category', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.countListings as jest.Mock).mockResolvedValue(3);

      await expect(serviceCategoriesService.deleteServiceCategory('cat-1')).rejects.toThrow(
        'Cannot delete category with 3 active listings'
      );
      expect(serviceCategoriesRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes and invalidates the cache when there are no active listings', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (serviceCategoriesRepository.countListings as jest.Mock).mockResolvedValue(0);
      (serviceCategoriesRepository.delete as jest.Mock).mockResolvedValue(undefined);
      jest.spyOn(redis, 'del').mockResolvedValue(1);

      await serviceCategoriesService.deleteServiceCategory('cat-1');

      expect(serviceCategoriesRepository.delete).toHaveBeenCalledWith('cat-1');
      expect(redis.del).toHaveBeenCalledWith('service_categories:all');
    });
  });
});
