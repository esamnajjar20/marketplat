/**
 * Notification types — Epic 6 (Notification Center). This is the
 * in-app bell/dropdown, NOT push (see PushNotificationToggle.tsx's own
 * doc comment — that's a separate, still-unwired subsystem needing
 * VAPID keys + a service worker + its own endpoint).
 *
 * Of these types, NEW_MESSAGE, FAV_AD_PRICE_CHANGED, FAV_AD_SOLD,
 * SAVED_SEARCH_MATCH, STORE_NEW_PRODUCT, STORE_PROMOTION_STARTED, and
 * STORE_PRODUCT_RESTOCKED are generated automatically. PROMOTION only
 * comes from the admin broadcast endpoint. WEEKLY_AD_VIEWS_REPORT has
 * no generator at all yet — no cron/scheduler exists in this codebase;
 * the type exists so the four notificationPreferences toggles map onto
 * real enum values, not because a row of this type will actually
 * appear yet.
 * PROMOTION_STATUS_CHANGE (PROMO-1, Phase 14) IS generated — see
 * backend's myPromotionsExpiring.ts, a scheduled script in the same
 * "no in-process cron, external scheduler required" category as
 * WEEKLY_AD_VIEWS_REPORT above, just actually wired up.
 *
 * FIX (Foundation v1): STORE_NEW_PRODUCT previously had a live producer
 * (notificationEvents.onStoreNewProduct) but was missing from this
 * union and from NotificationBell.tsx's TYPE_ICON/TYPE_LABEL maps — a
 * row of that type rendered with an undefined icon/label. Closed here
 * alongside the two new store-follower types added in the same pass
 * (STORE_PROMOTION_STARTED, STORE_PRODUCT_RESTOCKED — see
 * myPromotionsExpiring.ts's processStarted and products.service.ts's
 * updateProduct respectively for their triggers), since all three share
 * one audience (store followers) and one fix.
 */
export type NotificationType =
  | 'NEW_MESSAGE'
  | 'FAV_AD_PRICE_CHANGED'
  | 'FAV_AD_SOLD'
  | 'PROMOTION'
  | 'WEEKLY_AD_VIEWS_REPORT'
  | 'SAVED_SEARCH_MATCH'
  | 'PROMOTION_STATUS_CHANGE'
  | 'STORE_NEW_PRODUCT'
  | 'STORE_PROMOTION_STARTED'
  | 'STORE_PRODUCT_RESTOCKED'
  | 'NEW_SERVICE_QUOTE'
  | 'SERVICE_QUOTE_ACCEPTED'
  // FIX (audit #21): mirrors the new backend NotificationType value —
  // see notifications.service.ts's onStoreMemberInvited. Carries
  // storeId, memberId (below); links to /my-store/members (no
  // per-notification target page exists, same as PROMOTION_STATUS_CHANGE
  // linking to /my-store/promotions).
  | 'STORE_MEMBER_INVITED';

/** Per-type deep-link payload — only the keys relevant to `type` are
 * ever present. NEW_MESSAGE carries conversationId,
 * FAV_AD_PRICE_CHANGED, FAV_AD_SOLD, and SAVED_SEARCH_MATCH carry adId
 * (SAVED_SEARCH_MATCH also carries savedSearchId, unused for
 * navigation today but kept for a future "view this saved search"
 * link); PROMOTION and WEEKLY_AD_VIEWS_REPORT carry none right now.
 * PROMOTION_STATUS_CHANGE carries promotionId, productId, and event
 * (one of "started" | "expiring" | "expired") — see
 * myPromotionsExpiring.ts's own doc comment on the backend.
 * STORE_NEW_PRODUCT carries storeId. STORE_PROMOTION_STARTED carries
 * storeId, promotionId, productId. STORE_PRODUCT_RESTOCKED carries
 * storeId, productId — link to product or store when ids are present. */
export interface NotificationData {
  conversationId?: string;
  adId?: string;
  savedSearchId?: string;
  promotionId?: string;
  productId?: string;
  storeId?: string;
  listingId?: string;
  broadcastId?: string;
  quoteId?: string;
  memberId?: string;
  event?: 'started' | 'expiring' | 'expired';
  /** Set by dailyNotificationDigest job */
  digest?: boolean;
  counts?: Record<string, number>;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  /** نوع إشعار واحد */
  type?: NotificationType;
  /** فئة الواجهة: messages | favorites | stores | services | system */
  category?: 'messages' | 'favorites' | 'stores' | 'services' | 'system';
}
