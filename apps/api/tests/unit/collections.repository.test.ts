import { collectionsRepository } from '../../src/modules/collections/collections.repository';
import { prisma } from '../../src/config/prisma';
import { Prisma } from '@prisma/client';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    storeCollection: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    storeCollectionProduct: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe('collectionsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('create maps optional fields and default sortOrder', async () => {
    (prisma.storeCollection.create as jest.Mock).mockResolvedValue({ id: 'c1' });
    await collectionsRepository.create({
      storeId: 's1',
      name: 'Summer',
      slug: 'summer',
      description: 'd',
    });
    expect(prisma.storeCollection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 's1',
        name: 'Summer',
        slug: 'summer',
        sortOrder: 0,
      }),
    });
  });

  it('findById / findBySlugInStore / findByStoreId / findActiveByStoreId', async () => {
    (prisma.storeCollection.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.storeCollection.findMany as jest.Mock).mockResolvedValue([]);
    await collectionsRepository.findById('c1');
    await collectionsRepository.findBySlugInStore('s1', 'slug');
    await collectionsRepository.findByStoreId('s1');
    await collectionsRepository.findActiveByStoreId('s1');
    expect(prisma.storeCollection.findUnique).toHaveBeenCalled();
    expect(prisma.storeCollection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 's1', isActive: true } }),
    );
  });

  it('update, delete, reorder', async () => {
    (prisma.storeCollection.update as jest.Mock).mockResolvedValue({ id: 'c1' });
    (prisma.storeCollection.delete as jest.Mock).mockResolvedValue({ id: 'c1' });
    (prisma.$transaction as jest.Mock).mockResolvedValue([]);
    await collectionsRepository.update('c1', { name: 'N' });
    await collectionsRepository.delete('c1');
    await collectionsRepository.reorder('s1', ['c1', 'c2']);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('isUniqueConstraintError detects P2002', () => {
    const err = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(collectionsRepository.isUniqueConstraintError(err)).toBe(true);
    expect(collectionsRepository.isUniqueConstraintError(new Error('x'))).toBe(false);
  });

  it('membership helpers', async () => {
    (prisma.storeCollectionProduct.findMany as jest.Mock).mockResolvedValue([
      { productId: 'p1' },
    ]);
    (prisma.storeCollectionProduct.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });
    (prisma.storeCollectionProduct.create as jest.Mock).mockResolvedValue({});
    (prisma.storeCollectionProduct.delete as jest.Mock).mockResolvedValue({});
    (prisma.storeCollectionProduct.findFirst as jest.Mock).mockResolvedValue({ sortOrder: 2 });

    expect(await collectionsRepository.findMemberIds('c1')).toEqual(['p1']);
    expect(await collectionsRepository.isMember('c1', 'p1')).toBe(true);
    await collectionsRepository.addProduct('c1', 'p1', 0);
    await collectionsRepository.removeProduct('c1', 'p1');
    expect(await collectionsRepository.nextSortOrder('c1')).toBe(3);
    await collectionsRepository.findVisibleProducts('c1');
    expect(prisma.storeCollectionProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { collectionId: 'c1', product: { status: 'ACTIVE' } },
      }),
    );
  });

  it('nextSortOrder returns 0 when empty', async () => {
    (prisma.storeCollectionProduct.findFirst as jest.Mock).mockResolvedValue(null);
    expect(await collectionsRepository.nextSortOrder('c1')).toBe(0);
  });
});
