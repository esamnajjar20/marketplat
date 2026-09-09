/**
 * Seller profile types.
 * Mirrors backend's SellerProfile / SellerRating Prisma models
 * (see backend prisma/schema.prisma and seller-profile-design.md).
 *
 * Seller is a state (owning a SellerProfile row), not a Role — there is
 * no `isSeller` boolean or role value here. A user is a seller if and
 * only if a SellerProfile with their userId exists.
 */
import type { AdListItem } from './ad.types';
import type { StorePaymentMethodDto } from '@/types/store.types';

export type SellerVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface SellerProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  verified: boolean;
  verificationStatus: SellerVerificationStatus;
  verifiedAt: string | null;
  /** 0-1000 — computed server-side only, never client-writable. */
  trustScore: number;
  /**
   * Prisma Decimal(3,2) serialises to string in JSON — same pattern as
   * Ad.price in ad.types.ts. Parse with parseFloat() before display.
   */
  averageRating: string;
  totalRatings: number;
  totalAds: number;
  activeAds: number;
  totalSales: number;
  /** Prisma Decimal(5,2), percentage — string in JSON, or null if unset. */
  responseRate: string | null;
  responseTimeMinutes: number | null;
  paymentMethods?: StorePaymentMethodDto[] | null;
  joinedSellingAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /sellers/:id — public seller page, includes their active ads.
 * `user.city` is the seller's location — lives on User, not
 * SellerProfile (a seller has exactly one, unlike StoreDetails/
 * ServiceProviderDetails which each carry their own).
 */
export type SellerProfileWithAds = SellerProfile & {
  ads: AdListItem[];
  user: { city: string | null };
};

/** Payload for POST /sellers/me/profile */
export interface CreateSellerProfilePayload {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  agreedToSellerTerms: true;
}

/** Payload for PATCH /sellers/me/profile */
export interface UpdateSellerProfilePayload {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  paymentMethods?: StorePaymentMethodDto[] | null;
}

/** GET /sellers/me/attention — dashboard task counters */
export interface SellerAttention {
  adsMissingImages: number;
  productsOutOfStock: number;
  productsMissingImages: number;
  pendingServiceRequests: number;
  hasStore: boolean;
  isProvider: boolean;
}

/** Payload for POST /sellers/:id/ratings */
export interface CreateSellerRatingPayload {
  adId?: string;
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

/**
 * GET /sellers/:id/ratings row. Same "always included" convention as
 * StoreReview.rater/ServiceReview.rater — every row comes from
 * sellers.repository.ts's findManyRatingsBySellerProfileId, which
 * always joins the rater. `ad` is this type's one difference from
 * StoreReview/ServiceReview: a SellerRating can optionally be scoped
 * to one specific ad transaction (CreateSellerRatingPayload.adId is
 * optional), so it's null whenever the rating wasn't tied to a
 * particular ad.
 */
export interface SellerRating {
  id: string;
  score: number;
  comment: string | null;
  sellerProfileId: string;
  raterId: string;
  adId: string | null;
  createdAt: string;
  rater: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  ad: {
    id: string;
    title: string;
  } | null;
}
