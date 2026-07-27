/**
 * Ad / listing types.
 * Aligned with backend Prisma schema and API response shapes.
 *
 * FIX T-02: Removed 'PENDING' from AdStatus — not in backend schema.
 * FIX T-04: price is string | null (Prisma Decimal serialises to string in JSON).
 * FIX T-05: sort → sortBy, order → sortOrder to match backend getAdsSchema.
 */

// ── Enums (must match backend Prisma enums exactly) ───────────────

/** FIX T-02: backend schema has only ACTIVE | SOLD | DELETED */
export type AdStatus    = 'ACTIVE' | 'SOLD' | 'DELETED';
export type AdCondition = 'NEW' | 'USED' | 'REFURBISHED';

/**
 * FIX T-05: matches backend sortBy enum.
 * FIX H-1: 'views' added — backend's getAdsSchema now accepts it (see
 * ads.validation.ts). AD_SORT_OPTIONS in lib/constants.ts already sent
 * sortBy=views for its "الأكثر مشاهدة" option before this field existed
 * in the type, as an untyped string literal — this closes that gap so
 * the option is now actually type-checked against what the backend
 * accepts, instead of relying on the two staying in sync by coincidence.
 */
export type AdSortField = 'createdAt' | 'price' | 'views';
export type AdSortOrder = 'asc' | 'desc';

// ── Core entity ───────────────────────────────────────────────────

export interface Ad {
  id:           string;
  title:        string;
  description:  string;
  /**
   * FIX T-04: Prisma Decimal(10,2) serialises to string in JSON.
   * Always parse with parseFloat() or use formatPrice() before display.
   * Never treat as number directly.
   */
  price:        string | null;
  isNegotiable: boolean;
  condition:    AdCondition | null;
  city:         string;
  images:       string[];
  status:       AdStatus;
  views:        number;
  isFeatured:   boolean;
  isPinned:     boolean;
  userId:       string;
  /**
   * Nullable stats-only reference to the seller's SellerProfile (see
   * seller-profile-design.md §2 and types/seller.types.ts). userId above
   * remains the sole source of truth for ownership — this is only used
   * to link to /sellers/[id]. Ads created before the seller-profile
   * system existed may have this as null.
   */
  sellerProfileId: string | null;
  categoryId:   string | null;
  createdAt:    string;
  updatedAt:    string;
  user:         AdAuthor;
  category:     AdCategory | null;
}

export interface AdAuthor {
  id:        string;
  name:      string;
  avatarUrl: string | null;
  city:      string | null;
}

export interface AdCategory {
  id:     string;
  name:   string;
  nameAr: string;
}

/**
 * Lighter shape returned by list/search endpoints.
 * Excludes description (potentially 5000 chars) to reduce payload.
 * Use Ad only on detail pages.
 */
export type AdListItem = Omit<Ad, 'description'>;

// ── Request payloads ──────────────────────────────────────────────

export interface CreateAdPayload {
  title:         string;
  description:   string;
  price?:        number;
  isNegotiable?: boolean;
  condition?:    AdCondition;
  city:          string;
  categoryId?:   string;
  images?:       File[];
}

/**
 * All fields optional for partial updates (PATCH /api/v1/ads/:id).
 * Images use dedicated endpoints: POST/DELETE /ads/:id/images.
 */
export type UpdateAdPayload = Partial<Omit<CreateAdPayload, 'images'>> & {
  /** Allow status updates (mark as SOLD, restore to ACTIVE) */
  status?: AdStatus;
};

// ── Query / search params ─────────────────────────────────────────

/**
 * FIX T-05: field names now match backend getAdsSchema exactly.
 * Backend uses sortBy (not sort) and sortOrder (not order).
 * search (not q) for GET /ads — q is only for GET /ads/search.
 */
export interface AdSearchParams {
  city?:       string;
  categoryId?: string;
  condition?:  AdCondition;
  minPrice?:   number;
  maxPrice?:   number;
  search?:     string;    // for GET /ads — backend field name is 'search'
  sortBy?:     AdSortField;
  sortOrder?:  AdSortOrder;
  page?:       number;
  limit?:      number;
  status?:     AdStatus;  // used by my-ads + admin
  userId?:     string;    // used by admin
}

/** FIX T-05: search uses 'q' as the required query term */
export interface AdSearchQuery extends Omit<AdSearchParams, 'search'> {
  q: string;    // required — maps to backend searchAdsSchema.q
}

// ── Form helpers ─────────────────────────────────────────────────

export type AdFormMode = 'create' | 'edit';

export interface AdFormValues {
  title:          string;
  description:    string;
  price:          string;       // coerced to number | undefined on submit
  isNegotiable:   boolean;
  condition:      AdCondition | '';
  city:           string;
  categoryId:     string;
  images:         File[];       // new uploads
  existingImages: string[];     // URLs already on server
}
