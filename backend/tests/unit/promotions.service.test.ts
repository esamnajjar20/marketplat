import { promotionsService } from '../../src/modules/promotions/promotions.service';
import { promotionsRepository } from '../../src/modules/promotions/promotions.repository';
import { productsRepository } from '../../src/modules/products/products.repository';
import { requireStoreAccessForProducts } from '../../src/modules/stores/store-members.service';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { ConflictError } from '../../src/shared/errors/ConflictError';

jest.mock('../../src/modules/promotions/promotions.repository');
jest.mock('../../src/modules/products/products.repository');
jest.mock('../../src/modules/stores/store-members.service');

const storeId = 'store-1';
const userId = 'user-1';
const mockStore = { id: storeId } as any;

const mockProduct = {
  id: 'product-1',
  storeId,
  status: 'ACTIVE',
  price: { toString: () => '100' } as any,
  discountPrice: null,
};

const createInput = {
  productId: 'product-1',
  title: 'Summer Sale',
  discountType: 'PERCENTAGE' as const,
  discountValue: 15,
  // Relative dates so status stays SCHEDULED (startsAt > now) regardless of when the suite runs.
  startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

describe('promotionsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireStoreAccessForProducts as jest.Mock).mockResolvedValue(mockStore);
  });

  describe('createPromotion', () => {
    it('creates a promotion when the caller owns the product', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue(mockProduct);
      (promotionsRepository.create as jest.Mock).mockResolvedValue({ id: 'promo-1' });

      await promotionsService.createPromotion(userId, createInput);

      expect(promotionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ storeId, productId: 'product-1', status: 'SCHEDULED' })
      );
    });

    it('throws NotFoundError when the product does not exist', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(promotionsService.createPromotion(userId, createInput)).rejects.toThrow(
        NotFoundError
      );
      expect(promotionsRepository.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the product is soft-deleted', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockProduct,
        status: 'DELETED',
      });

      await expect(promotionsService.createPromotion(userId, createInput)).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws ForbiddenError when the product belongs to a different store', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockProduct,
        storeId: 'someone-elses-store',
      });

      await expect(promotionsService.createPromotion(userId, createInput)).rejects.toThrow(
        ForbiddenError
      );
      expect(promotionsRepository.create).not.toHaveBeenCalled();
    });

    it('sets status ACTIVE when startsAt is now or in the past', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue(mockProduct);
      (promotionsRepository.create as jest.Mock).mockResolvedValue({ id: 'promo-1' });

      await promotionsService.createPromotion(userId, {
        ...createInput,
        startsAt: new Date('2020-01-01T00:00:00.000Z'),
      });

      expect(promotionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ACTIVE' })
      );
    });

    it('sets status SCHEDULED when startsAt is in the future', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue(mockProduct);
      (promotionsRepository.create as jest.Mock).mockResolvedValue({ id: 'promo-1' });

      await promotionsService.createPromotion(userId, {
        ...createInput,
        startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      });

      expect(promotionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SCHEDULED' })
      );
    });

    // PROMO-1: this is the concurrent-create race the partial unique
    // index (see its migration) actually closes — two requests can both
    // pass the ownership/existence checks above, but only one insert
    // can win at the DB level. This test asserts the P2002 rejection is
    // translated into a clean 409, not leaked as a raw Prisma error.
    it('translates a unique-constraint violation into ConflictError', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue(mockProduct);
      const dbError = new Error('unique constraint');
      (promotionsRepository.create as jest.Mock).mockRejectedValue(dbError);
      (promotionsRepository.isUniqueConstraintError as jest.Mock).mockReturnValue(true);

      await expect(promotionsService.createPromotion(userId, createInput)).rejects.toThrow(
        ConflictError
      );
    });

    it('rethrows non-constraint errors from the repository unchanged', async () => {
      (productsRepository.findById as jest.Mock).mockResolvedValue(mockProduct);
      const dbError = new Error('connection lost');
      (promotionsRepository.create as jest.Mock).mockRejectedValue(dbError);
      (promotionsRepository.isUniqueConstraintError as jest.Mock).mockReturnValue(false);

      await expect(promotionsService.createPromotion(userId, createInput)).rejects.toThrow(
        'connection lost'
      );
    });
  });

  describe('updatePromotion / cancelPromotion / getPromotionById ownership', () => {
    const mockPromotion = {
      id: 'promo-1',
      storeId,
      status: 'ACTIVE',
      startsAt: new Date('2020-01-01'),
      endsAt: new Date('2099-01-01'),
      maxUses: null,
      usageCount: 0,
    };

    it('throws NotFoundError when the promotion does not exist', async () => {
      (promotionsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(promotionsService.updatePromotion(userId, 'promo-1', {})).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws ForbiddenError when the promotion belongs to a different store', async () => {
      (promotionsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockPromotion,
        storeId: 'someone-elses-store',
      });

      await expect(promotionsService.updatePromotion(userId, 'promo-1', {})).rejects.toThrow(
        ForbiddenError
      );
      expect(promotionsRepository.update).not.toHaveBeenCalled();
    });

    it('cancels a promotion the caller owns', async () => {
      (promotionsRepository.findById as jest.Mock).mockResolvedValue(mockPromotion);

      await promotionsService.cancelPromotion(userId, 'promo-1');

      expect(promotionsRepository.cancel).toHaveBeenCalledWith('promo-1');
    });

    it('does not allow cancelling a promotion from a different store', async () => {
      (promotionsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockPromotion,
        storeId: 'someone-elses-store',
      });

      await expect(promotionsService.cancelPromotion(userId, 'promo-1')).rejects.toThrow(
        ForbiddenError
      );
      expect(promotionsRepository.cancel).not.toHaveBeenCalled();
    });
  });

  describe('getEffectivePrice', () => {
    const product = {
      id: 'product-1',
      price: '100' as any,
      discountPrice: null as any,
    };

    it('returns the plain price when no promotion exists and no static discount is set', async () => {
      (promotionsRepository.findLiveByProductId as jest.Mock).mockResolvedValue(null);

      const result = await promotionsService.getEffectivePrice(product as any);

      expect(result).toEqual({
        price: 100,
        originalPrice: 100,
        discountPrice: null,
        discountPercentage: null,
        hasActivePromotion: false,
        activePromotionId: null,
      });
    });

    it('falls back to the static discountPrice when no live promotion exists', async () => {
      (promotionsRepository.findLiveByProductId as jest.Mock).mockResolvedValue(null);

      const result = await promotionsService.getEffectivePrice({
        ...product,
        discountPrice: '80' as any,
      } as any);

      expect(result.discountPrice).toBe(80);
      expect(result.discountPercentage).toBe(20);
      expect(result.hasActivePromotion).toBe(false);
    });

    it('computes a percentage discount from an active promotion, ignoring the static discountPrice', async () => {
      (promotionsRepository.findLiveByProductId as jest.Mock).mockResolvedValue({
        id: 'promo-1',
        discountType: 'PERCENTAGE',
        discountValue: '20' as any,
        status: 'ACTIVE',
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2099-01-01'),
        maxUses: null,
        usageCount: 0,
      });

      const result = await promotionsService.getEffectivePrice({
        ...product,
        discountPrice: '95' as any,
      } as any);

      expect(result.discountPrice).toBe(80);
      expect(result.discountPercentage).toBe(20);
      expect(result.hasActivePromotion).toBe(true);
      expect(result.activePromotionId).toBe('promo-1');
    });

    it('computes a fixed-amount discount from an active promotion', async () => {
      (promotionsRepository.findLiveByProductId as jest.Mock).mockResolvedValue({
        id: 'promo-1',
        discountType: 'FIXED_AMOUNT',
        discountValue: '30' as any,
        status: 'ACTIVE',
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2099-01-01'),
        maxUses: null,
        usageCount: 0,
      });

      const result = await promotionsService.getEffectivePrice(product as any);

      expect(result.discountPrice).toBe(70);
      expect(result.hasActivePromotion).toBe(true);
    });

    it('does not apply a promotion whose window has not started yet', async () => {
      (promotionsRepository.findLiveByProductId as jest.Mock).mockResolvedValue({
        id: 'promo-1',
        discountType: 'PERCENTAGE',
        discountValue: '20' as any,
        status: 'SCHEDULED',
        startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        endsAt: new Date('2099-01-01'),
        maxUses: null,
        usageCount: 0,
      });

      const result = await promotionsService.getEffectivePrice(product as any);

      expect(result.hasActivePromotion).toBe(false);
      expect(result.discountPrice).toBeNull();
    });

    it('does not apply a promotion whose window has already ended', async () => {
      (promotionsRepository.findLiveByProductId as jest.Mock).mockResolvedValue({
        id: 'promo-1',
        discountType: 'PERCENTAGE',
        discountValue: '20' as any,
        status: 'ACTIVE',
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2020-02-01'),
        maxUses: null,
        usageCount: 0,
      });

      const result = await promotionsService.getEffectivePrice(product as any);

      expect(result.hasActivePromotion).toBe(false);
    });

    it('does not apply a promotion that has exhausted maxUses', async () => {
      (promotionsRepository.findLiveByProductId as jest.Mock).mockResolvedValue({
        id: 'promo-1',
        discountType: 'PERCENTAGE',
        discountValue: '20' as any,
        status: 'ACTIVE',
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2099-01-01'),
        maxUses: 10,
        usageCount: 10,
      });

      const result = await promotionsService.getEffectivePrice(product as any);

      expect(result.hasActivePromotion).toBe(false);
    });
  });

  describe('getEffectivePrices (batch)', () => {
    it('maps each product to its own effective price with a single query', async () => {
      const products = [
        { id: 'p1', price: '100' as any, discountPrice: null as any },
        { id: 'p2', price: '200' as any, discountPrice: null as any },
      ];
      (promotionsRepository.findLiveByProductIds as jest.Mock).mockResolvedValue([
        {
          id: 'promo-1',
          productId: 'p1',
          discountType: 'PERCENTAGE',
          discountValue: '10' as any,
          status: 'ACTIVE',
          startsAt: new Date('2020-01-01'),
          endsAt: new Date('2099-01-01'),
          maxUses: null,
          usageCount: 0,
        },
      ]);

      const result = await promotionsService.getEffectivePrices(products as any);

      expect(promotionsRepository.findLiveByProductIds).toHaveBeenCalledWith(['p1', 'p2']);
      expect(result.get('p1')?.hasActivePromotion).toBe(true);
      expect(result.get('p1')?.discountPrice).toBe(90);
      expect(result.get('p2')?.hasActivePromotion).toBe(false);
    });
  });
});
