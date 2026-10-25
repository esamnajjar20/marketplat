import { BADGE_THRESHOLDS } from './badges.constants';

// BADGES: only the 4 badges backed by data that already exists in this
// schema. TOP_SELLER (completedOrders >= 100) and FAST_RESPONSE need
// an Order model and message-response-time tracking, neither of which
// exist here — dropped from scope rather than half-built against data
// that doesn't exist yet (see the P1 design doc's original 6-badge
// list for the deferred two).
export type BadgeType = 'VERIFIED' | 'HIGHLY_RATED' | 'POPULAR' | 'NEW_STORE';

export interface Badge {
  type: BadgeType;
  label: string;
  icon: string;
}

const BADGE_META: Record<BadgeType, Omit<Badge, 'type'>> = {
  VERIFIED: { label: 'متجر موثّق', icon: '✓' },
  HIGHLY_RATED: { label: 'تقييم عالٍ', icon: '⭐' },
  POPULAR: { label: 'متجر رائج', icon: '🔥' },
  NEW_STORE: { label: 'متجر جديد', icon: '🆕' },
};

export interface BadgeInput {
  createdAt: Date;
  views: number;
  followerCount: number;
  sellerVerified: boolean;
  avgRating: number | null;
  reviewCount: number;
}

// Pure function — no I/O, so it's independently testable without a
// database, unlike everything else in this module.
// PROVIDER-BADGES: same 4-badge shape as the store version above, but
// a provider has no follower count or standalone `views` column (see
// service-listings.repository.ts's getStatsByProviderId — views are
// summed across listings, not stored on ServiceProviderDetails
// itself), so POPULAR is judged on total listing views OR completed
// requests instead of views OR followers. Kept as a distinct type
// (not a union with BadgeType) since "مقدم خدمة رائج"/"مقدم خدمة جديد"
// read wrong on a store and vice versa — same reasoning
// types/badge.types.ts gives for naming the frontend type
// `StoreBadge` instead of reusing a shared `Badge`.
export type ProviderBadgeType = 'VERIFIED' | 'HIGHLY_RATED' | 'POPULAR' | 'NEW_PROVIDER';

export interface ProviderBadge {
  type: ProviderBadgeType;
  label: string;
  icon: string;
}

const PROVIDER_BADGE_META: Record<ProviderBadgeType, Omit<ProviderBadge, 'type'>> = {
  VERIFIED: { label: 'مقدم خدمة موثّق', icon: '✓' },
  HIGHLY_RATED: { label: 'تقييم عالٍ', icon: '⭐' },
  POPULAR: { label: 'الأكثر طلبًا', icon: '🔥' },
  NEW_PROVIDER: { label: 'مقدم خدمة جديد', icon: '🆕' },
};

export interface ProviderBadgeInput {
  createdAt: Date;
  totalViews: number;
  completedRequestsCount: number;
  sellerVerified: boolean;
  avgRating: number | null;
  reviewCount: number;
}

export const computeProviderBadges = (
  input: ProviderBadgeInput,
  now: Date = new Date()
): ProviderBadge[] => {
  const badges: ProviderBadgeType[] = [];

  if (input.sellerVerified) badges.push('VERIFIED');

  if (
    input.avgRating !== null &&
    input.avgRating >= BADGE_THRESHOLDS.HIGHLY_RATED_MIN_AVG &&
    input.reviewCount >= BADGE_THRESHOLDS.HIGHLY_RATED_MIN_REVIEWS
  ) {
    badges.push('HIGHLY_RATED');
  }

  // "الأكثر طلبًا" (POPULAR): same POPULAR_MIN_VIEWS threshold as
  // stores' own POPULAR badge, reused rather than inventing a second
  // views bar for what's the same underlying signal (total reach).
  // completedRequestsCount reuses the same numeric bar as
  // POPULAR_MIN_FOLLOWERS — not because "50 completed jobs" and "50
  // followers" are equivalent effort, only because there is no
  // separate product decision on record for a completed-jobs bar
  // (same "not a measured number" caveat as badges.constants.ts's own
  // top comment), and reusing one existing constant is preferable to
  // inventing a second unreviewed number.
  if (
    input.totalViews >= BADGE_THRESHOLDS.POPULAR_MIN_VIEWS ||
    input.completedRequestsCount >= BADGE_THRESHOLDS.POPULAR_MIN_FOLLOWERS
  ) {
    badges.push('POPULAR');
  }

  const ageDays = (now.getTime() - input.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= BADGE_THRESHOLDS.NEW_STORE_MAX_AGE_DAYS) {
    badges.push('NEW_PROVIDER');
  }

  return badges.map(type => ({ type, ...PROVIDER_BADGE_META[type] }));
};

export const computeBadges = (input: BadgeInput, now: Date = new Date()): Badge[] => {
  const badges: BadgeType[] = [];

  if (input.sellerVerified) badges.push('VERIFIED');

  if (
    input.avgRating !== null &&
    input.avgRating >= BADGE_THRESHOLDS.HIGHLY_RATED_MIN_AVG &&
    input.reviewCount >= BADGE_THRESHOLDS.HIGHLY_RATED_MIN_REVIEWS
  ) {
    badges.push('HIGHLY_RATED');
  }

  if (
    input.views >= BADGE_THRESHOLDS.POPULAR_MIN_VIEWS ||
    input.followerCount >= BADGE_THRESHOLDS.POPULAR_MIN_FOLLOWERS
  ) {
    badges.push('POPULAR');
  }

  const ageMs = now.getTime() - input.createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= BADGE_THRESHOLDS.NEW_STORE_MAX_AGE_DAYS) {
    badges.push('NEW_STORE');
  }

  return badges.map(type => ({ type, ...BADGE_META[type] }));
};
