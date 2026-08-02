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
export type StorePlan = 'FREE' | 'FEATURED';

export interface StoreDetails {
  id: string;
  sellerProfileId: string;
  name: string;
  description: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  city: string;
  address: string | null;
  phone: string;
  status: StoreStatus;
  plan: StorePlan;
  /** Prisma Decimal(9,6) — string in JSON, or null if unset. */
  latitude: string | null;
  longitude: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /stores (public directory) — each row includes its parent seller. */
export type StoreWithSeller = StoreDetails & {
  sellerProfile: SellerProfile;
};

/** GET /stores/:id — public store page, includes follower/product counts. */
export type StoreWithSellerAndCounts = StoreDetails & {
  sellerProfile: SellerProfile;
  _count: { followers: number; products: number };
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
}>;

export type StoreSortField = 'createdAt' | 'name';

/** GET /stores query params — public directory browse/search. */
export interface StoresQuery {
  page?: number;
  limit?: number;
  city?: string;
  search?: string;
  sortBy?: StoreSortField;
  sortOrder?: 'asc' | 'desc';
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
