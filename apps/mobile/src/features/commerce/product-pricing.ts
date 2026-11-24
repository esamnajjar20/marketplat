/** Resolve the public price exactly as the API's EffectivePrice contract defines it. */
export type EffectivePriceShape = {
  price?: number | string | null;
  amount?: number | string | null;
  originalPrice?: number | string | null;
  discountPrice?: number | string | null;
  discountPercentage?: number | null;
  hasActivePromotion?: boolean;
};

export type ProductPricingSource = {
  price?: number | string | null;
  discountPrice?: number | string | null;
  effectivePrice?: EffectivePriceShape | null;
};

export function getProductPricing(product: ProductPricingSource) {
  const effective = product.effectivePrice;
  const basePrice = effective?.originalPrice ?? product.price ?? effective?.price ?? effective?.amount ?? null;
  const resolvedDiscount = effective && Object.prototype.hasOwnProperty.call(effective, 'discountPrice')
    ? effective.discountPrice
    : product.discountPrice;
  const hasDiscount = resolvedDiscount != null
    && basePrice != null
    && Number.isFinite(Number(resolvedDiscount))
    && Number.isFinite(Number(basePrice))
    && Number(resolvedDiscount) < Number(basePrice);
  const currentPrice = hasDiscount
    ? resolvedDiscount
    : effective?.price ?? effective?.amount ?? product.price ?? product.discountPrice ?? null;
  const percentage = hasDiscount
    ? effective?.discountPercentage ?? Math.round((1 - Number(resolvedDiscount) / Number(basePrice)) * 100)
    : null;

  return {
    currentPrice,
    originalPrice: hasDiscount ? basePrice : null,
    discountPercentage: percentage,
    hasDiscount,
  };
}
