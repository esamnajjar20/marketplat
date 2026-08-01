/**
 * Notification types — Epic 6 (Notification Center). This is the
 * in-app bell/dropdown, NOT push (see PushNotificationToggle.tsx's own
 * doc comment — that's a separate, still-unwired subsystem needing
 * VAPID keys + a service worker + its own endpoint).
 *
 * Of these five types, NEW_MESSAGE, FAV_AD_PRICE_CHANGED, and
 * SAVED_SEARCH_MATCH are generated automatically (conversations.service.ts,
 * ads.service.ts, saved-searches.service.ts respectively). PROMOTION only
 * comes from the admin broadcast endpoint. WEEKLY_AD_VIEWS_REPORT has no
 * generator at all yet — no cron/scheduler exists in this codebase; the
 * type exists so the four notificationPreferences toggles map onto real
 * enum values, not because a row of this type will actually appear yet.
 */
export type NotificationType =
  | 'NEW_MESSAGE'
  | 'FAV_AD_PRICE_CHANGED'
  | 'PROMOTION'
  | 'WEEKLY_AD_VIEWS_REPORT'
  | 'SAVED_SEARCH_MATCH';

/** Per-type deep-link payload — only the keys relevant to `type` are
 * ever present. NEW_MESSAGE carries conversationId,
 * FAV_AD_PRICE_CHANGED and SAVED_SEARCH_MATCH carry adId
 * (SAVED_SEARCH_MATCH also carries savedSearchId, unused for
 * navigation today but kept for a future "view this saved search"
 * link); PROMOTION and WEEKLY_AD_VIEWS_REPORT carry none right now. */
export interface NotificationData {
  conversationId?: string;
  adId?: string;
  savedSearchId?: string;
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
}
