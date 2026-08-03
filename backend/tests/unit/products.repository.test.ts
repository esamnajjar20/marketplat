import { productsRepository } from '../../src/modules/products/products.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    product: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockTx = { product: { create: jest.fn() } } as any;
const storeId = 'store-1';

const productWithRelationsInclude = {
  store: { include: { sellerProfile: true } },
  category: { select: { id: true, name: true, nameAr: true } },
};

describe('productsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a product with all provided fields under the given storeId', async () => {
      const data = {
        categoryId: 'cat-1',
        name: 'Product 1',
        description: 'A long enough description',
        images: ['http://img'],
        price: 100,
        discountPrice: 80,
        wholesalePrice: 70,
        wholesaleMinQty: 10,
        availability: 'IN_STOCK' as const,
      };
      mockTx.product.create.mockResolvedValue({ id: 'product-1' });

      await productsRepository.create(mockTx, storeId, data);

      expect(mockTx.product.create).toHaveBeenCalledWith({
        data: {
          storeId,
          categoryId: data.categoryId,
          name: data.name,
          description: data.description,
          images: data.images,
          price: data.price,
          discountPrice: data.discountPrice,
          wholesalePrice: data.wholesalePrice,
          wholesaleMinQty: data.wholesaleMinQty,
          availability: data.availability,
        },
      });
    });

    it('creates a product without optional wholesale/discount fields', async () => {
      const data = {
        categoryId: 'cat-1',
        name: 'Product 1',
        description: 'A long enough description',
        images: [] as string[],
        price: 50,
        availability: 'IN_STOCK' as const,
      };
      mockTx.product.create.mockResolvedValue({ id: 'product-2' });

      await productsRepository.create(mockTx, storeId, data);

      const call = mockTx.product.create.mock.calls[0][0];
      expect(call.data.discountPrice).toBeUndefined();
      expect(call.data.wholesalePrice).toBeUndefined();
      expect(call.data.wholesaleMinQty).toBeUndefined();
    });
  });

  describe('findById / findPublicById / incrementViews', () => {
    it('findById queries by id only, with no relations included', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
      await productsRepository.findById('product-1');
      expect(prisma.product.findUnique).toHaveBeenCalledWith({ where: { id: 'product-1' } });
    });

    it('findPublicById includes store+sellerProfile and category', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
      await productsRepository.findPublicById('product-1');
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        include: productWithRelationsInclude,
      });
    });

    it('incrementViews increments the views counter by 1', async () => {
      (prisma.product.update as jest.Mock).mockResolvedValue({});
      await productsRepository.incrementViews('product-1');
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { views: { increment: 1 } },
      });
    });
  });

  describe('update / softDelete', () => {
    it('update passes through the given partial data', async () => {
      (prisma.product.update as jest.Mock).mockResolvedValue({});
      await productsRepository.update('product-1', { name: 'New name', price: 99 });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { name: 'New name', price: 99 },
      });
    });

    it('softDelete sets status to DELETED', async () => {
      (prisma.product.update as jest.Mock).mockResolvedValue({});
      await productsRepository.softDelete('product-1');
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { status: 'DELETED' },
      });
    });
  });

  describe('findMany — filter branches', () => {
    beforeEach(() => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as jest.Mock).mockResolvedValue(0);
    });

    it('applies only the base ACTIVE + store-ACTIVE filter with no optional filters given', async () => {
      await productsRepository.findMany({} as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ status: 'ACTIVE', store: { status: 'ACTIVE' } });
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('applies categoryId filter', async () => {
      await productsRepository.findMany({ categoryId: 'cat-1' } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.categoryId).toBe('cat-1');
    });

    it('applies storeId filter', async () => {
      await productsRepository.findMany({ storeId: 'store-1' } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.storeId).toBe('store-1');
    });

    it('applies availability filter', async () => {
      await productsRepository.findMany({ availability: 'LIMITED' } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.availability).toBe('LIMITED');
    });

    it('applies city filter via the store relation (overriding the base store filter)', async () => {
      await productsRepository.findMany({ city: 'Gaza' } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.store).toEqual({ status: 'ACTIVE', city: 'Gaza' });
    });

    it('applies only minPrice when maxPrice is omitted', async () => {
      await productsRepository.findMany({ minPrice: 50 } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.price).toEqual({ gte: 50 });
    });

    it('applies only maxPrice when minPrice is omitted', async () => {
      await productsRepository.findMany({ maxPrice: 200 } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.price).toEqual({ lte: 200 });
    });

    it('combines minPrice and maxPrice', async () => {
      await productsRepository.findMany({ minPrice: 50, maxPrice: 200 } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.price).toEqual({ gte: 50, lte: 200 });
    });

    it('applies a case-insensitive OR search across name and description', async () => {
      await productsRepository.findMany({ search: 'phone' } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { name: { contains: 'phone', mode: 'insensitive' } },
        { description: { contains: 'phone', mode: 'insensitive' } },
      ]);
    });

    it('combines every optional filter at once', async () => {
      await productsRepository.findMany({
        categoryId: 'cat-1',
        storeId: 'store-1',
        city: 'Gaza',
        availability: 'OUT_OF_STOCK',
        minPrice: 50,
        maxPrice: 200,
        search: 'phone',
        sortBy: 'price',
        sortOrder: 'asc',
      } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({
        status: 'ACTIVE',
        categoryId: 'cat-1',
        storeId: 'store-1',
        availability: 'OUT_OF_STOCK',
        store: { status: 'ACTIVE', city: 'Gaza' },
        price: { gte: 50, lte: 200 },
        OR: [
          { name: { contains: 'phone', mode: 'insensitive' } },
          { description: { contains: 'phone', mode: 'insensitive' } },
        ],
      });
      expect(call.orderBy).toEqual({ price: 'asc' });
    });

    it('applies pagination skip/take', async () => {
      await productsRepository.findMany({ page: 3, limit: 10 } as any);
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(20);
      expect(call.take).toBe(10);
    });

    it('returns products and total', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([{ id: 'product-1' }]);
      (prisma.product.count as jest.Mock).mockResolvedValue(1);

      const result = await productsRepository.findMany({} as any);

      expect(result).toEqual({ products: [{ id: 'product-1' }], total: 1 });
    });
  });

  describe('findManyByStoreId', () => {
    beforeEach(() => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as jest.Mock).mockResolvedValue(0);
    });

    it('excludes DELETED products by default when no status filter is given', async () => {
      await productsRepository.findManyByStoreId(storeId, {});
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ storeId, status: { not: 'DELETED' } });
    });

    it('filters to the exact status when one is given', async () => {
      await productsRepository.findManyByStoreId(storeId, { status: 'PAUSED' });
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ storeId, status: 'PAUSED' });
    });

    it('orders by createdAt desc', async () => {
      await productsRepository.findManyByStoreId(storeId, {});
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('applies default pagination', async () => {
      await productsRepository.findManyByStoreId(storeId, {});
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });

    it('applies custom pagination', async () => {
      await productsRepository.findManyByStoreId(storeId, { page: 2, limit: 5 });
      const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(5);
      expect(call.take).toBe(5);
    });

    it('returns products and total', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([{ id: 'product-1' }]);
      (prisma.product.count as jest.Mock).mockResolvedValue(1);

      const result = await productsRepository.findManyByStoreId(storeId, {});

      expect(result).toEqual({ products: [{ id: 'product-1' }], total: 1 });
    });
  });
});
