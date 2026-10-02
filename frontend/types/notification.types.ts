/**
 * Notification types — in-app bell/list + deep-link payloads.
 *
 * External delivery (Web Push + FCM) is wired on the backend
 * (pushService / fcmPushService) and the frontend toggle
 * (PushNotificationToggle + lib/pwa). Delivery still requires
 * configured VAPID keys (web) and/or Firebase (native).
 *
 * Keep this union in sync with prisma `NotificationType` and
 * backend `notifications.validation.ts` notificationTypeEnum.
 */
export type NotificationType =
  | 'NEW_MESSAGE'
  | 'FAV_AD_PRICE_CHANGED'
  | 'FAV_AD_SOLD'
  | 'PROMOTION'
  | 'WEEKLY_AD_VIEWS_REPORT'
  | 'WEEKLY_STORE_VIEWS_REPORT'
  | 'WEEKLY_SERVICE_VIEWS_REPORT'
  | 'SAVED_SEARCH_MATCH'
  | 'PROMOTION_STATUS_CHANGE'
  | 'STORE_NEW_PRODUCT'
  | 'STORE_PROMOTION_STARTED'
  | 'STORE_PRODUCT_RESTOCKED'
  | 'STORE_MEMBER_INVITED'
  | 'NEW_REQUEST_OFFER'
  | 'REQUEST_OFFER_ACCEPTED'
  | 'NEW_SERVICE_QUOTE'
  | 'SERVICE_QUOTE_ACCEPTED'
  | 'SERVICE_REQUEST_NEW'
  | 'SERVICE_REQUEST_UPDATE'
  | 'APPOINTMENT_UPDATE';

/** Per-type deep-link payload — only relevant keys are present per type. */
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
  requestId?: string;
  offerId?: string;
  status?: string;
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

/** سجل جهاز واحد مسجَّل لاستلام الإشعارات الخارجية — GET /notifications/devices. */
export interface NotificationDevice {
  id: string;
  /** web = متصفح/PWA، native = تطبيق Capacitor (FCM) */
  kind: 'web' | 'native';
  /** اسم يراه المستخدم؛ null للسجلات القديمة قبل إضافة الأسماء */
  label: string | null;
  platform: 'android' | 'ios' | null;
  /** sha256(endpoint|token) أول 16 خانة — يعرّف الجهاز الحالي دون كشف بيانات الاعتماد */
  fingerprint: string;
  createdAt: string;
  lastSeenAt: string;
}
