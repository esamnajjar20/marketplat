import type { ProductAvailability } from '@prisma/client';

/** At or below this quantity (but above zero) a product is shown as LIMITED. */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * Derive a product's `availability` from its tracked stock quantity.
 * Single source of truth for sales, marketplace orders and any future
 * stock-mutating flow (previously copy-pasted as an inline ternary).
 */
export function availabilityForStock(quantity: number): ProductAvailability {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'LIMITED';
  return 'IN_STOCK';
}
