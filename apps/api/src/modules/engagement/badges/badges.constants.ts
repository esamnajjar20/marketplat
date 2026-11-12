// BADGES: thresholds are not derived from any product decision on
// record in this codebase — there is no prior "top seller"/"popular"
// bar defined anywhere else to match, so these are reasonable starting
// defaults, not measured/confirmed numbers. Centralized here so they
// can be tuned in one place once real usage data (or a product
// decision) says otherwise, without touching badges.service.ts.
export const BADGE_THRESHOLDS = {
  HIGHLY_RATED_MIN_AVG: 4.5,
  HIGHLY_RATED_MIN_REVIEWS: 20,
  POPULAR_MIN_VIEWS: 1000,
  POPULAR_MIN_FOLLOWERS: 50,
  NEW_STORE_MAX_AGE_DAYS: 30,
} as const;
