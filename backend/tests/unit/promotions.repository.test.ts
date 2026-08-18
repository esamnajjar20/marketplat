import { promotionsRepository } from '../../src/modules/promotions/promotions.repository';
import { prisma } from '../../src/config/prisma';
import { Prisma } from '@prisma/client';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    promotion: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

describe('promotionsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a promotion with all provided fields', async () => {
      const data = {
        storeId: 'store-1',
        productId: 'product-1',
        title: 'Summer Sale',
        description: 'up to 20% off',
        discountType: 'PERCENTAGE' as const,
        discountValue: 20,
        startsAt: new Date('2026-08-19'),
        endsAt: new Date('2026-08-25'),
        status: 'SCHEDULED' as const,
        maxUses: 100,
      };
      (prisma.promotion.create as jest.Mock).mockResolvedValue({ id: 'promo-1' });

      await promotionsRepository.create(data);

      expect(prisma.promotion.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('findLiveByProductId', () => {
    it('queries for a promotion in SCHEDULED or ACTIVE status for the given product', async () => {
      (prisma.promotion.findFirst as jest.Mock).mockResolvedValue(null);

      await promotionsRepository.findLiveByProductId('product-1');

      expect(prisma.promotion.findFirst).toHaveBeenCalledWith({
        where: { productId: 'product-1', status: { in: ['SCHEDULED', 'ACTIVE'] } },
      });
    });
  });

  describe('findLiveByProductIds', () => {
    it('queries for live promotions across multiple products in one call', async () => {
      (prisma.promotion.findMany as jest.Mock).mockResolvedValue([]);

      await promotionsRepository.findLiveByProductIds(['p1', 'p2']);

      expect(prisma.promotion.findMany).toHaveBeenCalledWith({
        where: { productId: { in: ['p1', 'p2'] }, status: { in: ['SCHEDULED', 'ACTIVE'] } },
      });
    });
  });

  describe('cancel', () => {
    it('sets status to CANCELLED', async () => {
      (prisma.promotion.update as jest.Mock).mockResolvedValue({ id: 'promo-1' });

      await promotionsRepository.cancel('promo-1');

      expect(prisma.promotion.update).toHaveBeenCalledWith({
        where: { id: 'promo-1' },
        data: { status: 'CANCELLED' },
      });
    });
  });

  describe('isUniqueConstraintError', () => {
    it('returns true for a P2002 PrismaClientKnownRequestError', () => {
      const error = new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      expect(promotionsRepository.isUniqueConstraintError(error)).toBe(true);
    });

    it('returns false for a different Prisma error code', () => {
      const error = new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      expect(promotionsRepository.isUniqueConstraintError(error)).toBe(false);
    });

    it('returns false for a plain Error', () => {
      expect(promotionsRepository.isUniqueConstraintError(new Error('boom'))).toBe(false);
    });
  });
});
