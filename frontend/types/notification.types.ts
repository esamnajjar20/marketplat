/** Shared notification contracts: one vocabulary for API, web and mobile. */
import type {
  Notification,
  NotificationData,
  NotificationType,
  NotificationCategory,
} from '@marketplat/contracts';

export type { Notification, NotificationData, NotificationType, NotificationCategory };

export interface NotificationsQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  /** نوع إشعار واحد */
  type?: NotificationType;
  /** فئة موحدة مشتركة بين الويب والموبايل. */
  category?: NotificationCategory;
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
