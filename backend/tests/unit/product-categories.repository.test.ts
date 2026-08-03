import { productCategoriesRepository } from '../../src/modules/product-categories/product-categories.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    productCategory: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      count: jest.fn(),
    },
  },
}));

describe('productCategoriesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates with the given data', async () => {
      const data = { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' } as any;
      (prisma.productCategory.create as jest.Mock).mockResolvedValue({ id: 'cat-1', ...data });

      await productCategoriesRepository.create(data);

      expect(prisma.productCategory.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('findMany', () => {
    it('queries only active top-level categories with active children, ordered by name', async () => {
      (prisma.productCategory.findMany as jest.Mock).mockResolvedValue([]);

      await productCategoriesRepository.findMany();

      expect(prisma.productCategory.findMany).toHaveBeenCalledWith({
        where: { parentId: null, isActive: true },
        include: { children: { where: { isActive: true } } },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findManyForAdmin', () => {
    it('queries all top-level categories with product counts on both category and children', async () => {
      (prisma.productCategory.findMany as jest.Mock).mockResolvedValue([]);

      await productCategoriesRepository.findManyForAdmin();

      expect(prisma.productCategory.findMany).toHaveBeenCalledWith({
        where: { parentId: null },
        include: {
          children: {
            orderBy: { name: 'asc' },
            include: { _count: { select: { products: true } } },
          },
          _count: { select: { products: true } },
        },
        orderBy: { name: 'asc' },
      });
    });

    it('does not filter by isActive (includes inactive categories for admin view)', async () => {
      (prisma.productCategory.findMany as jest.Mock).mockResolvedValue([]);
      await productCategoriesRepository.findManyForAdmin();
      const call = (prisma.productCategory.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.isActive).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('queries by id including all children (active or not)', async () => {
      (prisma.productCategory.findUnique as jest.Mock).mockResolvedValue(null);
      await productCategoriesRepository.findById('cat-1');
      expect(prisma.productCategory.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: { children: true },
      });
    });
  });

  describe('findBySlug', () => {
    it('queries by slug', async () => {
      (prisma.productCategory.findUnique as jest.Mock).mockResolvedValue(null);
      await productCategoriesRepository.findBySlug('electronics');
      expect(prisma.productCategory.findUnique).toHaveBeenCalledWith({
        where: { slug: 'electronics' },
      });
    });
  });

  describe('findByName', () => {
    it('queries by name', async () => {
      (prisma.productCategory.findUnique as jest.Mock).mockResolvedValue(null);
      await productCategoriesRepository.findByName('Electronics');
      expect(prisma.productCategory.findUnique).toHaveBeenCalledWith({
        where: { name: 'Electronics' },
      });
    });
  });

  describe('findByNameAr', () => {
    it('queries by nameAr', async () => {
      (prisma.productCategory.findUnique as jest.Mock).mockResolvedValue(null);
      await productCategoriesRepository.findByNameAr('إلكترونيات');
      expect(prisma.productCategory.findUnique).toHaveBeenCalledWith({
        where: { nameAr: 'إلكترونيات' },
      });
    });
  });

  describe('update', () => {
    it('updates with the given data', async () => {
      const data = { icon: 'phone-icon' } as any;
      (prisma.productCategory.update as jest.Mock).mockResolvedValue({ id: 'cat-1', ...data });
      await productCategoriesRepository.update('cat-1', data);
      expect(prisma.productCategory.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data,
      });
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      (prisma.productCategory.delete as jest.Mock).mockResolvedValue({});
      await productCategoriesRepository.delete('cat-1');
      expect(prisma.productCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    });
  });

  describe('countProducts', () => {
    it('counts only ACTIVE products referencing the category', async () => {
      (prisma.product.count as jest.Mock).mockResolvedValue(5);
      const result = await productCategoriesRepository.countProducts('cat-1');
      expect(result).toBe(5);
      expect(prisma.product.count).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', status: 'ACTIVE' },
      });
    });
  });
});
