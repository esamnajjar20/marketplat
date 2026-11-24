import { describe, expect, it } from 'vitest';
import { getProductPricing } from '../product-pricing';

describe('getProductPricing', () => {
  it('prefers an active promotion over a stale static product discount', () => {
    expect(getProductPricing({
      price: 100,
      discountPrice: 80,
      effectivePrice: {
        price: 100,
        originalPrice: 100,
        discountPrice: 90,
        discountPercentage: 10,
        hasActivePromotion: true,
      },
    })).toEqual({
      currentPrice: 90,
      originalPrice: 100,
      discountPercentage: 10,
      hasDiscount: true,
    });
  });

  it('uses the API effective price without inventing a discount', () => {
    expect(getProductPricing({
      price: 100,
      effectivePrice: { price: 100, originalPrice: 100, discountPrice: null, hasActivePromotion: false },
    })).toEqual({ currentPrice: 100, originalPrice: null, discountPercentage: null, hasDiscount: false });
  });

  it('retains the legacy static discount when the effective-price field is absent', () => {
    expect(getProductPricing({ price: 100, discountPrice: 75 })).toEqual({
      currentPrice: 75,
      originalPrice: 100,
      discountPercentage: 25,
      hasDiscount: true,
    });
  });
});
