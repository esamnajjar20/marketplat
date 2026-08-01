import { storesRepository } from '../../src/modules/stores/stores.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    storeDetails: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    product: { count: jest.fn() },
  },
}));

const storeId = 'store-1';
const sellerProfileId = 'seller-profile-1';

const createData = {
  name: 'My Store',
  description: 'A store description with enough characters',
  city: 'غزة',
  address: 'Main street',
  phone: '0599111222',
  logoUrl: 'https://example.com/logo.png',
  coverImageUrl: 'https://example.com/cover.png',
  latitude: 31.5,
  longitude: 34.4,
};

describe('storesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findBySellerProfileId', () => {
    it('queries storeDetails by sellerProfileId', async () => {
      (prisma.storeDetails.findUnique as jest.Mock).mockResolvedValue(null);
      await storesRepository.findBySellerProfileId(sellerProfileId);
      expect(prisma.storeDetails.findUnique).toHaveBeenCalledWith({
        where: { sellerProfileId },
      });
    });
  });

  describe('findById', () => {
    it('queries storeDetails by id with no include', async () => {
      (prisma.storeDetails.findUnique as jest.Mock).mockResolvedValue(null);
      await storesRepository.findById(storeId);
      expect(prisma.storeDetails.findUnique).toHaveBeenCalledWith({ where: { id: storeId } });
    });
  });

  describe('findPublicById', () => {
    it('queries by id including sellerProfile and follower/product counts', async () => {
      (prisma.storeDetails.findUnique as jest.Mock).mockResolvedValue(null);
      await storesRepository.findPublicById(storeId);
      expect(prisma.storeDetails.findUnique).toHaveBeenCalledWith({
        where: { id: storeId },
        include: {
          sellerProfile: true,
          _count: { select: { followers: true, products: true } },
        },
      });
    });
  });

  describe('create', () => {
    it('creates a store scoped to the given sellerProfileId via the transaction client', async () => {
      const tx = { storeDetails: { create: jest.fn().mockResolvedValue({ id: storeId }) } } as any;

      await storesRepository.create(tx, sellerProfileId, createData);

      expect(tx.storeDetails.create).toHaveBeenCalledWith({
        data: {
          sellerProfileId,
          name: createData.name,
          description: createData.description,
          city: createData.city,
          address: createData.address,
          phone: createData.phone,
          logoUrl: createData.logoUrl,
          coverImageUrl: createData.coverImageUrl,
          latitude: createData.latitude,
          longitude: createData.longitude,
        },
      });
    });

    it('does not touch the shared prisma client, only the passed transaction client', async () => {
      const tx = { storeDetails: { create: jest.fn().mockResolvedValue({ id: storeId }) } } as any;

      await storesRepository.create(tx, sellerProfileId, createData);

      expect(prisma.storeDetails.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates the store with the given partial data', async () => {
      (prisma.storeDetails.update as jest.Mock).mockResolvedValue({ id: storeId });
      const patch = { name: 'Renamed Store' };

      await storesRepository.update(storeId, patch);

      expect(prisma.storeDetails.update).toHaveBeenCalledWith({
        where: { id: storeId },
        data: patch,
      });
    });
  });

  describe('updateStatus', () => {
    it('updates only the status field', async () => {
      (prisma.storeDetails.update as jest.Mock).mockResolvedValue({ id: storeId });

      await storesRepository.updateStatus(storeId, 'ACTIVE');

      expect(prisma.storeDetails.update).toHaveBeenCalledWith({
        where: { id: storeId },
        data: { status: 'ACTIVE' },
      });
    });
  });

  describe('findMany', () => {
    it('applies default pagination, ACTIVE-only filter, and plan-desc-first ordering', async () => {
      (prisma.storeDetails.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.storeDetails.count as jest.Mock).mockResolvedValue(0);

      await storesRepository.findMany({});

      expect(prisma.storeDetails.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
        include: { sellerProfile: true },
        orderBy: [{ plan: 'desc' }, { createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(prisma.storeDetails.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
    });

    it('adds a city filter when provided', async () => {
      (prisma.storeDetails.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.storeDetails.count as jest.Mock).mockResolvedValue(0);

      await storesRepository.findMany({ city: 'غزة' });

      expect(prisma.storeDetails.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE', city: 'غزة' },
        })
      );
    });

    it('adds a case-insensitive OR search across name and description when provided', async () => {
      (prisma.storeDetails.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.storeDetails.count as jest.Mock).mockResolvedValue(0);

      await storesRepository.findMany({ search: 'phones' });

      expect(prisma.storeDetails.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'ACTIVE',
            OR: [
              { name: { contains: 'phones', mode: 'insensitive' } },
              { description: { contains: 'phones', mode: 'insensitive' } },
            ],
          },
        })
      );
    });

    it('honors a custom sortBy/sortOrder as the secondary sort after plan', async () => {
      (prisma.storeDetails.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.storeDetails.count as jest.Mock).mockResolvedValue(0);

      await storesRepository.findMany({ sortBy: 'name', sortOrder: 'asc' });

      expect(prisma.storeDetails.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ plan: 'desc' }, { name: 'asc' }],
        })
      );
    });

    it('applies custom page/limit to skip/take', async () => {
      (prisma.storeDetails.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.storeDetails.count as jest.Mock).mockResolvedValue(0);

      await storesRepository.findMany({ page: 3, limit: 10 });

      expect(prisma.storeDetails.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    it('returns stores and total from Promise.all results', async () => {
      const stores = [{ id: storeId }];
      (prisma.storeDetails.findMany as jest.Mock).mockResolvedValue(stores);
      (prisma.storeDetails.count as jest.Mock).mockResolvedValue(1);

      const result = await storesRepository.findMany({});

      expect(result).toEqual({ stores, total: 1 });
    });
  });

  describe('countActiveProducts', () => {
    it('counts ACTIVE products scoped to the given storeId', async () => {
      (prisma.product.count as jest.Mock).mockResolvedValue(5);

      const result = await storesRepository.countActiveProducts(storeId);

      expect(prisma.product.count).toHaveBeenCalledWith({
        where: { storeId, status: 'ACTIVE' },
      });
      expect(result).toBe(5);
    });
  });
});
