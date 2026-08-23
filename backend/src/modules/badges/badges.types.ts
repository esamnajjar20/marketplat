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
