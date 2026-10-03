/**
 * Store types — maps to backend's StoreDetails / StoreFollower /
 * StoreReview Prisma models. Verified directly against the stores
 * backend module (stores.controller.ts / stores.repository.ts /
 * stores.validation.ts / prisma/schema.prisma), same conventions as
 * service.types.ts:
 *
 *   - A StoreDetails row hangs off SellerProfile, exactly like
 *     ServiceProviderDetails does — a user must already be a seller
 *     (own a SellerProfile) before they can open a store. There is no
 *     standalone "store owner role".
 *   - latitude/longitude are Prisma Decimal(9,6) — strings in JSON,
 *     same convention as SellerProfile.averageRating.
 *   - GET /stores (public directory) sorts FEATURED-plan stores first
 *     (`orderBy: [{ plan: 'desc' }, ...]`), then the requested sort —
 *     no frontend action needed, just documented here since it affects
 *     what "sort by newest" actually returns.
 */
import type { SellerProfile } from './seller.types';

export type StoreStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED';
export interface StoreTypeLabels {
  products: string;
  product: string;
  addProduct: string;
  categories: string;
}

export interface StoreType {
  id: string;
  slug: string;
  nameAr: string;
  icon: string;
  labels: StoreTypeLabels;
  freeProductLimit?: number | null;
  isActive?: boolean;
  sortOrder?: number;
  hasActiveStores?: boolean;
}

export const DEFAULT_STORE_TYPE_LABELS: StoreTypeLabels = {
  products: 'المنتجات',
  product: 'منتج',
  addProduct: 'أضف منتجًا',
  categories: 'التصنيفات',
};

export function getStoreTypeLabels(storeType?: Partial<StoreType> | null): StoreTypeLabels {
  return {
    products: storeType?.labels?.products || DEFAULT_STORE_TYPE_LABELS.products,
    product: storeType?.labels?.product || DEFAULT_STORE_TYPE_LABELS.product,
    addProduct: storeType?.labels?.addProduct || DEFAULT_STORE_TYPE_LABELS.addProduct,
    categories: storeType?.labels?.categories || DEFAULT_STORE_TYPE_LABELS.categories,
  };
}

export type StorePlan = 'FREE' | 'FEATURED';

/** STORE-HOURS: same { sun: {open,close}|null, ... } shape as the
 * backend's workingHoursSchema / ServiceProviderDetails.workingHours —
 * one weekday key per entry, null meaning "closed all day". */
export type StoreWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export type StoreDaySchedule = { open: string; close: string } | null;
export type StoreWorkingHours = Record<StoreWeekday, StoreDaySchedule>;

/** عنصر طريقة دفع محفوظة على المتجر */
export interface StorePaymentMethodDto {
  id: string;
  kind: 'jawwal' | 'palpay' | 'bank' | 'custom';
  label: string;
  accountName: string;
  accountNumber: string;
}

export interface StoreDetails {

  id: string;
  sellerProfileId: string;
  storeTypeId: string;
  storeType?: StoreType | null;
  name: string;
  /** STORE-SLUG: URL-safe, shareable identifier. Immutable after
   * creation — GET /stores/:idOrSlug accepts either this or `id`. */
  slug: string;
  description: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  city: string;
  address: string | null;
  phone: string;
  // UNIFY-PAYMENTS-STORES: no paymentMethods field here anymore — a
  // store's payment methods are its parent SellerProfile.paymentMethods
  // (see StoreWithSeller.sellerProfile below). Managed only from the
  // seller's own profile page.
  status: StoreStatus;
  plan: StorePlan;
  featureRequestedAt?: string | null;
  /** Prisma Decimal(9,6) — string in JSON, or null if unset. */
  latitude: string | null;
  longitude: string | null;
  workingHours: StoreWorkingHours | null;
  /** Lifetime view counter — bumped on every GET /stores/:idOrSlug. */
  views: number;
  createdAt: string;
  updatedAt: string;
}

/** GET /stores (public directory) — each row includes its parent seller. */
export type StoreWithSeller = StoreDetails & {
  sellerProfile: SellerProfile;
};

/** GET /stores/:idOrSlug — public store page, includes follower/product
 * counts and a live open/closed flag computed server-side from
 * `workingHours` (null when workingHours hasn't been set at all — treat
 * as "unknown", not "closed"). */
export type StoreWithSellerAndCounts = StoreDetails & {
  sellerProfile: SellerProfile;
  _count: { followers: number; products: number };
  isOpen: boolean | null;
};

export interface StoreReview {
  id: string;
  score: number;
  comment: string | null;
  sellerProfileId: string;
  raterId: string;
  createdAt: string;
  // Same "always included" convention as ServiceReview.rater — every
  // GET /stores/:id/reviews row comes from
  // store-reviews.repository.ts's findManyBySellerProfileId, which
  // always joins the rater.
  rater: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

// ── Payloads ─────────────────────────────────────────────────────

/** POST /stores. */
export interface CreateStorePayload {
  name: string;
  description: string;
  city: string;
  address?: string;
  phone: string;
  logoUrl?: string;
  coverImageUrl?: string;
  latitude?: number;
  longitude?: number;
  workingHours?: StoreWorkingHours;
  storeTypeId?: string;
}

/** PATCH /stores/me. */
export type UpdateStorePayload = Partial<{
  name: string;
  description: string;
  city: string;
  address: string | null;
  phone: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  workingHours: StoreWorkingHours;
  storeTypeId: string;
}>;

/** GET /stores/me/analytics — owner-only. No orders/revenue/conversion:
 * this backend has no Order model yet, so those numbers don't exist to
 * report. Every field here reads from data that already existed before
 * this endpoint (StoreDetails.views, StoreFollower, Promotion.usageCount,
 * Product.views). */
export interface StoreAnalytics {
  views: number;
  followers: number;
  newFollowers7d: number;
  newFollowers30d: number;
  activeProducts: number;
  activePromotions: number;
  promotionUses: number;
  topProducts: { id: string; name: string; views: number; image: string | null }[];
}

export type StoreSortField = 'createdAt' | 'name';

/** GET /stores query params — public directory browse/search. */
export interface StoresQuery {
  page?: number;
  limit?: number;
  city?: string;
  search?: string;
  sortBy?: StoreSortField;
  sortOrder?: 'asc' | 'desc';
  type?: string;
}

/** PATCH /stores/:id/status — admin-only approve/block. */
export interface UpdateStoreStatusPayload {
  status: StoreStatus;
}

/** POST /stores/:id/follow — toggles; response tells you which way it went. */
export interface ToggleStoreFollowResult {
  action: 'followed' | 'unfollowed';
}

/**
 * GET /stores/me/followed row shape — verified against
 * store-followers.repository.ts's StoreFollowerWithStore: each follow
 * record includes the full followed store (with its seller), not just
 * a bare storeId, so "my followed stores" can render store cards
 * directly with no extra fetch per row.
 */
export interface StoreFollowerWithStore {
  id: string;
  userId: string;
  storeId: string;
  createdAt: string;
  store: StoreWithSeller;
}

/** POST /stores/:id/reviews. */
export interface CreateStoreReviewPayload {
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

export interface StoreReviewsQuery {
  page?: number;
  limit?: number;
}
