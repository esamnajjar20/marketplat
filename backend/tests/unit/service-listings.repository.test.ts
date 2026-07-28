import { serviceListingsRepository } from '../../src/modules/service-listings/service-listings.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    serviceListing: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockTx = { serviceListing: { create: jest.fn() } } as any;
const providerId = 'provider-1';

describe('serviceListingsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates with all provided fields', async () => {
      const data = {
        categoryId: 'cat-1',
        title: 'Home cleaning',
        description: 'Deep cleaning service',
        images: ['http://img'],
        pricingType: 'FIXED' as const,
        price: 100,
        durationEstimate: '2 hours',
        serviceLocation: 'AT_CUSTOMER' as const,
      };
      mockTx.serviceListing.create.mockResolvedValue({ id: 'listing-1' });

      await serviceListingsRepository.create(mockTx, providerId, data);

      expect(mockTx.serviceListing.create).toHaveBeenCalledWith({
        data: { providerId, ...data },
      });
    });
  });

  describe('findById / findPublicById / incrementViews', () => {
    it('findById queries by id only', async () => {
      (prisma.serviceListing.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceListingsRepository.findById('listing-1');
      expect(prisma.serviceListing.findUnique).toHaveBeenCalledWith({ where: { id: 'listing-1' } });
    });

    it('findPublicById includes provider+sellerProfile and category', async () => {
      (prisma.serviceListing.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceListingsRepository.findPublicById('listing-1');
      expect(prisma.serviceListing.findUnique).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
        include: {
          provider: { include: { sellerProfile: true } },
          category: { select: { id: true, name: true, nameAr: true } },
        },
      });
    });

    it('incrementViews increments the views counter', async () => {
      (prisma.serviceListing.update as jest.Mock).mockResolvedValue({});
      await serviceListingsRepository.incrementViews('listing-1');
      expect(prisma.serviceListing.update).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
        data: { views: { increment: 1 } },
      });
    });
  });

  describe('update / softDelete', () => {
    it('update passes through the given data', async () => {
      (prisma.serviceListing.update as jest.Mock).mockResolvedValue({});
      await serviceListingsRepository.update('listing-1', { title: 'New title' });
      expect(prisma.serviceListing.update).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
        data: { title: 'New title' },
      });
    });

    it('softDelete sets status to DELETED', async () => {
      (prisma.serviceListing.update as jest.Mock).mockResolvedValue({});
      await serviceListingsRepository.softDelete('listing-1');
      expect(prisma.serviceListing.update).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
        data: { status: 'DELETED' },
      });
    });
  });

  describe('findMany — filter branches', () => {
    beforeEach(() => {
      (prisma.serviceListing.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.serviceListing.count as jest.Mock).mockResolvedValue(0);
    });

    it('applies only the base ACTIVE filter with no optional filters given', async () => {
      await serviceListingsRepository.findMany({} as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ status: 'ACTIVE' });
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('applies categoryId filter', async () => {
      await serviceListingsRepository.findMany({ categoryId: 'cat-1' } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.categoryId).toBe('cat-1');
    });

    it('applies providerId filter', async () => {
      await serviceListingsRepository.findMany({ providerId: 'provider-1' } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.providerId).toBe('provider-1');
    });

    it('applies serviceLocation filter', async () => {
      await serviceListingsRepository.findMany({ serviceLocation: 'REMOTE' } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.serviceLocation).toBe('REMOTE');
    });

    it('applies city filter via provider.serviceAreaCities relation', async () => {
      await serviceListingsRepository.findMany({ city: 'Amman' } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.provider).toEqual({ serviceAreaCities: { has: 'Amman' } });
    });

    it('applies only minPrice when maxPrice is omitted', async () => {
      await serviceListingsRepository.findMany({ minPrice: 50 } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.price).toEqual({ gte: 50 });
    });

    it('applies only maxPrice when minPrice is omitted', async () => {
      await serviceListingsRepository.findMany({ maxPrice: 200 } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.price).toEqual({ lte: 200 });
    });

    it('combines minPrice and maxPrice', async () => {
      await serviceListingsRepository.findMany({ minPrice: 50, maxPrice: 200 } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.price).toEqual({ gte: 50, lte: 200 });
    });

    it('applies a case-insensitive OR search across title and description', async () => {
      await serviceListingsRepository.findMany({ search: 'cleaning' } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { title: { contains: 'cleaning', mode: 'insensitive' } },
        { description: { contains: 'cleaning', mode: 'insensitive' } },
      ]);
    });

    it('combines every optional filter at once', async () => {
      await serviceListingsRepository.findMany({
        categoryId: 'cat-1',
        providerId: 'provider-1',
        city: 'Amman',
        serviceLocation: 'REMOTE',
        minPrice: 50,
        maxPrice: 200,
        search: 'cleaning',
        sortBy: 'price',
        sortOrder: 'asc',
      } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({
        status: 'ACTIVE',
        categoryId: 'cat-1',
        providerId: 'provider-1',
        serviceLocation: 'REMOTE',
        provider: { serviceAreaCities: { has: 'Amman' } },
        price: { gte: 50, lte: 200 },
        OR: [
          { title: { contains: 'cleaning', mode: 'insensitive' } },
          { description: { contains: 'cleaning', mode: 'insensitive' } },
        ],
      });
      expect(call.orderBy).toEqual({ price: 'asc' });
    });

    it('applies pagination skip/take', async () => {
      await serviceListingsRepository.findMany({ page: 3, limit: 10 } as any);
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(20);
      expect(call.take).toBe(10);
    });

    it('returns listings and total', async () => {
      (prisma.serviceListing.findMany as jest.Mock).mockResolvedValue([{ id: 'listing-1' }]);
      (prisma.serviceListing.count as jest.Mock).mockResolvedValue(1);

      const result = await serviceListingsRepository.findMany({} as any);

      expect(result).toEqual({ listings: [{ id: 'listing-1' }], total: 1 });
    });
  });

  describe('findManyByProviderId', () => {
    beforeEach(() => {
      (prisma.serviceListing.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.serviceListing.count as jest.Mock).mockResolvedValue(0);
    });

    it('excludes DELETED listings by default when no status filter is given', async () => {
      await serviceListingsRepository.findManyByProviderId(providerId, {});
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ providerId, status: { not: 'DELETED' } });
    });

    it('filters to the exact status when one is given', async () => {
      await serviceListingsRepository.findManyByProviderId(providerId, { status: 'PAUSED' });
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ providerId, status: 'PAUSED' });
    });

    it('applies default pagination', async () => {
      await serviceListingsRepository.findManyByProviderId(providerId, {});
      const call = (prisma.serviceListing.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });
  });
});
