import { serviceCategoriesRepository } from '../../src/modules/service-categories/service-categories.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    serviceCategory: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    serviceListing: {
      count: jest.fn(),
    },
  },
}));

describe('serviceCategoriesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates with the given data', async () => {
      const data = { name: 'Plumbing', nameAr: 'سباكة', slug: 'plumbing' } as any;
      (prisma.serviceCategory.create as jest.Mock).mockResolvedValue({ id: 'cat-1', ...data });

      await serviceCategoriesRepository.create(data);

      expect(prisma.serviceCategory.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('findMany', () => {
    it('queries only active top-level categories with active children, ordered by name', async () => {
      (prisma.serviceCategory.findMany as jest.Mock).mockResolvedValue([]);

      await serviceCategoriesRepository.findMany();

      expect(prisma.serviceCategory.findMany).toHaveBeenCalledWith({
        where: { parentId: null, isActive: true },
        include: { children: { where: { isActive: true } } },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('queries by id including all children (active or not)', async () => {
      (prisma.serviceCategory.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceCategoriesRepository.findById('cat-1');
      expect(prisma.serviceCategory.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: { children: true },
      });
    });
  });

  describe('findBySlug', () => {
    it('queries by slug', async () => {
      (prisma.serviceCategory.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceCategoriesRepository.findBySlug('plumbing');
      expect(prisma.serviceCategory.findUnique).toHaveBeenCalledWith({ where: { slug: 'plumbing' } });
    });
  });

  describe('findByName', () => {
    it('queries by name', async () => {
      (prisma.serviceCategory.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceCategoriesRepository.findByName('Plumbing');
      expect(prisma.serviceCategory.findUnique).toHaveBeenCalledWith({ where: { name: 'Plumbing' } });
    });
  });

  describe('findByNameAr', () => {
    it('queries by nameAr', async () => {
      (prisma.serviceCategory.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceCategoriesRepository.findByNameAr('سباكة');
      expect(prisma.serviceCategory.findUnique).toHaveBeenCalledWith({ where: { nameAr: 'سباكة' } });
    });
  });

  describe('update', () => {
    it('updates with the given data', async () => {
      const data = { icon: 'wrench' } as any;
      (prisma.serviceCategory.update as jest.Mock).mockResolvedValue({ id: 'cat-1', ...data });
      await serviceCategoriesRepository.update('cat-1', data);
      expect(prisma.serviceCategory.update).toHaveBeenCalledWith({ where: { id: 'cat-1' }, data });
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      (prisma.serviceCategory.delete as jest.Mock).mockResolvedValue({});
      await serviceCategoriesRepository.delete('cat-1');
      expect(prisma.serviceCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    });
  });

  describe('countListings', () => {
    it('counts only ACTIVE listings referencing the category', async () => {
      (prisma.serviceListing.count as jest.Mock).mockResolvedValue(5);
      const result = await serviceCategoriesRepository.countListings('cat-1');
      expect(result).toBe(5);
      expect(prisma.serviceListing.count).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', status: 'ACTIVE' },
      });
    });
  });
});

