import {
  createPromotionSchema,
  updatePromotionSchema,
  promotionIdSchema,
} from '../../src/modules/promotions/promotions.validation';

describe('promotions.validation', () => {
  describe('createPromotionSchema', () => {
    const valid = {
      productId: 'product-1',
      title: 'Summer Sale',
      discountType: 'PERCENTAGE' as const,
      discountValue: 15,
      startsAt: '2026-08-20T00:00:00.000Z',
      endsAt: '2026-08-30T00:00:00.000Z',
    };

    it('accepts a valid percentage promotion', () => {
      const result = createPromotionSchema.parse({ body: valid });
      expect(result.body.discountType).toBe('PERCENTAGE');
      expect(result.body.discountValue).toBe(15);
    });

    it('accepts a valid fixed-amount promotion', () => {
      const result = createPromotionSchema.parse({
        body: { ...valid, discountType: 'FIXED_AMOUNT', discountValue: 50 },
      });
      expect(result.body.discountType).toBe('FIXED_AMOUNT');
    });

    it('rejects endsAt before startsAt', () => {
      expect(() =>
        createPromotionSchema.parse({
          body: { ...valid, startsAt: '2026-08-30T00:00:00.000Z', endsAt: '2026-08-20T00:00:00.000Z' },
        })
      ).toThrow(/endsAt must be after startsAt/);
    });

    it('rejects endsAt equal to startsAt', () => {
      expect(() =>
        createPromotionSchema.parse({
          body: { ...valid, startsAt: valid.startsAt, endsAt: valid.startsAt },
        })
      ).toThrow(/endsAt must be after startsAt/);
    });

    it('rejects a percentage discount over 100', () => {
      expect(() =>
        createPromotionSchema.parse({
          body: { ...valid, discountType: 'PERCENTAGE', discountValue: 101 },
        })
      ).toThrow(/cannot exceed 100/);
    });

    it('accepts a percentage discount of exactly 100', () => {
      const result = createPromotionSchema.parse({
        body: { ...valid, discountType: 'PERCENTAGE', discountValue: 100 },
      });
      expect(result.body.discountValue).toBe(100);
    });

    it('allows a fixed-amount discount over 100', () => {
      const result = createPromotionSchema.parse({
        body: { ...valid, discountType: 'FIXED_AMOUNT', discountValue: 250 },
      });
      expect(result.body.discountValue).toBe(250);
    });

    it('rejects a negative discountValue', () => {
      expect(() =>
        createPromotionSchema.parse({ body: { ...valid, discountValue: -10 } })
      ).toThrow();
    });

    it('rejects a title shorter than 2 characters', () => {
      expect(() => createPromotionSchema.parse({ body: { ...valid, title: 'S' } })).toThrow();
    });

    it('rejects a missing productId', () => {
      const { productId, ...rest } = valid;
      expect(() => createPromotionSchema.parse({ body: rest })).toThrow();
    });

    it('accepts an optional maxUses', () => {
      const result = createPromotionSchema.parse({ body: { ...valid, maxUses: 100 } });
      expect(result.body.maxUses).toBe(100);
    });

    it('rejects a non-integer maxUses', () => {
      expect(() =>
        createPromotionSchema.parse({ body: { ...valid, maxUses: 1.5 } })
      ).toThrow();
    });
  });

  describe('updatePromotionSchema', () => {
    it('accepts a partial update with only title', () => {
      const result = updatePromotionSchema.parse({
        params: { id: 'promo-1' },
        body: { title: 'New title' },
      });
      expect(result.body.title).toBe('New title');
    });

    it('accepts status CANCELLED', () => {
      const result = updatePromotionSchema.parse({
        params: { id: 'promo-1' },
        body: { status: 'CANCELLED' },
      });
      expect(result.body.status).toBe('CANCELLED');
    });

    it('rejects any status other than CANCELLED', () => {
      expect(() =>
        updatePromotionSchema.parse({ params: { id: 'promo-1' }, body: { status: 'ACTIVE' } })
      ).toThrow();
    });

    it('rejects endsAt before startsAt when both are provided', () => {
      expect(() =>
        updatePromotionSchema.parse({
          params: { id: 'promo-1' },
          body: { startsAt: '2026-08-30T00:00:00.000Z', endsAt: '2026-08-20T00:00:00.000Z' },
        })
      ).toThrow(/endsAt must be after startsAt/);
    });

    it('rejects a percentage discountValue over 100 on update', () => {
      expect(() =>
        updatePromotionSchema.parse({
          params: { id: 'promo-1' },
          body: { discountType: 'PERCENTAGE', discountValue: 150 },
        })
      ).toThrow(/cannot exceed 100/);
    });

    it('accepts clearing description with null', () => {
      const result = updatePromotionSchema.parse({
        params: { id: 'promo-1' },
        body: { description: null },
      });
      expect(result.body.description).toBeNull();
    });
  });

  describe('promotionIdSchema', () => {
    it('accepts a valid id param', () => {
      const result = promotionIdSchema.parse({ params: { id: 'promo-1' } });
      expect(result.params.id).toBe('promo-1');
    });

    it('rejects an empty id', () => {
      expect(() => promotionIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });
});
