/**
 * Email fallback rules (pure). The queue worker decides WHEN; this file
 * decides WHAT is eligible and how the digest is shaped.
 */

/**
 * Only person-to-person / transactional notifications may escalate to email.
 * Marketing-ish and bulk types (PROMOTION, WEEKLY_*_REPORT, STORE_NEW_PRODUCT,
 * STORE_PROMOTION_STARTED, STORE_PRODUCT_RESTOCKED, FAV_AD_*, SAVED_SEARCH_MATCH,
 * PROMOTION_STATUS_CHANGE) are deliberately excluded: an unsolicited email per
 * price drop is how a sender domain gets flagged as spam.
 */
export const EMAIL_FALLBACK_TYPES = [
  'NEW_MESSAGE',
  'NEW_SERVICE_QUOTE',
  'SERVICE_QUOTE_ACCEPTED',
  'NEW_REQUEST_OFFER',
  'REQUEST_OFFER_ACCEPTED',
  'SERVICE_REQUEST_NEW',
  'SERVICE_REQUEST_UPDATE',
  'APPOINTMENT_UPDATE',
  'STORE_MEMBER_INVITED',
] as const;

export type EmailFallbackType = (typeof EMAIL_FALLBACK_TYPES)[number];

const ELIGIBLE = new Set<string>(EMAIL_FALLBACK_TYPES);

export function isEmailFallbackType(type: unknown): type is EmailFallbackType {
  return typeof type === 'string' && ELIGIBLE.has(type);
}

/** Opt-in: absent / non-boolean-true means off. */
export function userWantsEmailFallback(prefs: unknown): boolean {
  return (
    !!prefs &&
    typeof prefs === 'object' &&
    !Array.isArray(prefs) &&
    (prefs as Record<string, unknown>).emailFallback === true
  );
}

export interface DigestItem {
  title: string;
  body: string;
}

export interface DigestSummary {
  subject: string;
  /** Items actually rendered (capped). */
  shown: DigestItem[];
  /** Unread eligible notifications not rendered. */
  more: number;
}

export const DIGEST_MAX_ITEMS = 5;

export function summarizeDigest(items: DigestItem[], totalUnread: number): DigestSummary {
  const shown = items.slice(0, DIGEST_MAX_ITEMS);
  const total = Math.max(totalUnread, shown.length);
  const subject =
    total <= 1 && shown[0]
      ? `${shown[0].title} — سوق غزة`
      : `لديك ${total} إشعارات غير مقروءة — سوق غزة`;
  return { subject, shown, more: Math.max(0, total - shown.length) };
}

/** Redis key: one fallback email per user per gap window. */
export const emailFallbackGapKey = (userId: string): string => `emailfb_gap_${userId}`;
