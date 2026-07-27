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
  joinedSellingAt: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /sellers/:id — public seller page, includes their active ads. */
export type SellerProfileWithAds = SellerProfile & { ads: AdListItem[] };

/** Payload for POST /sellers/me/profile */
export interface CreateSellerProfilePayload {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  agreedToSellerTerms: true;
}

/** Payload for POST /sellers/:id/ratings */
export interface CreateSellerRatingPayload {
  adId?: string;
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}
