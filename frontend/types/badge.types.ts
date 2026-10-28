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

/**
 * Provider badges — maps to backend's badges module's
 * computeProviderBadges (badges.types.ts). Kept distinct from
 * StoreBadge/StoreBadgeType (not a shared union) since "الأكثر طلبًا"/
 * "مقدم خدمة جديد" read wrong on a store and vice versa — same
 * reasoning the backend type gives for not unifying the two.
 */
export type ProviderBadgeType = 'VERIFIED' | 'HIGHLY_RATED' | 'POPULAR' | 'NEW_PROVIDER';

export interface ProviderBadge {
  type: ProviderBadgeType;
  label: string;
  icon: string;
}
