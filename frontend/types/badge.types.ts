/**
 * Store badges — maps to backend's badges module (badges.types.ts).
 * Computed, not stored: GET /badges/store/:storeId derives these live
 * from SellerProfile/StoreReview/StoreDetails, so there is no owner
 * CRUD here, only a public read.
 *
 * Named `StoreBadge` (not `Badge`) to avoid colliding with the shared
 * shadcn `Badge` UI component every store component already imports.
 */
export type StoreBadgeType = 'VERIFIED' | 'HIGHLY_RATED' | 'POPULAR' | 'NEW_STORE';

export interface StoreBadge {
  type: StoreBadgeType;
  label: string;
  icon: string;
}
