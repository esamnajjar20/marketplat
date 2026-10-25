import { categoriesRepository } from '../../src/modules/categories/categories.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    category: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ad: { count: jest.fn() },
  },
}));

const categoryId = 'cat-1';
const createData = { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' };

describe('categoriesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a category with the given data', async () => {
      (prisma.category.create as jest.Mock).mockResolvedValue({ id: categoryId, ...createData });
      await categoriesRepository.create(createData);
      expect(prisma.category.create).toHaveBeenCalledWith({ data: createData });
    });
  });

  describe('findMany', () => {
    it('queries top-level categories (parentId null) with children included, ordered by name', async () => {
      (prisma.category.findMany as jest.Mock).mockResolvedValue([]);
      await categoriesRepository.findMany();
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { parentId: null },
        include: { children: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('queries by id with children included', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      await categoriesRepository.findById(categoryId);
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: categoryId },
        include: { children: true },
      });
    });
  });

  describe('findBySlug', () => {
    it('queries by slug', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      await categoriesRepository.findBySlug('electronics');
      expect(prisma.category.findUnique).toHaveBeenCalledWith({ where: { slug: 'electronics' } });
    });
  });

  describe('findByName', () => {
    it('queries by name', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      await categoriesRepository.findByName('Electronics');
      expect(prisma.category.findUnique).toHaveBeenCalledWith({ where: { name: 'Electronics' } });
    });
  });

  describe('findByNameAr', () => {
    it('queries by nameAr', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      await categoriesRepository.findByNameAr('إلكترونيات');
      expect(prisma.category.findUnique).toHaveBeenCalledWith({ where: { nameAr: 'إلكترونيات' } });
    });
  });

  describe('update', () => {
    it('updates with the given partial data', async () => {
      (prisma.category.update as jest.Mock).mockResolvedValue({ id: categoryId });
      await categoriesRepository.update(categoryId, { name: 'New Name' });
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: categoryId },
        data: { name: 'New Name' },
      });
    });

    it('allows nulling out parentId', async () => {
      (prisma.category.update as jest.Mock).mockResolvedValue({ id: categoryId });
      await categoriesRepository.update(categoryId, { parentId: null });
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: categoryId },
        data: { parentId: null },
      });
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      (prisma.category.delete as jest.Mock).mockResolvedValue({ id: categoryId });
      await categoriesRepository.delete(categoryId);
      expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: categoryId } });
    });
  });

  describe('countAds', () => {
    it('counts only ACTIVE ads in the category', async () => {
      (prisma.ad.count as jest.Mock).mockResolvedValue(5);
      const result = await categoriesRepository.countAds(categoryId);
      expect(prisma.ad.count).toHaveBeenCalledWith({
        where: { categoryId, status: 'ACTIVE' },
      });
      expect(result).toBe(5);
    });
  });
});
