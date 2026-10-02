/**
 * مصدر واحد لأيقونات/تسميات/روابط/فئات الإشعارات —
 * تستهلكه NotificationBell و NotificationsPage.
 *
 * PHASE-A: مزامنة كاملة مع prisma NotificationType.
 */
import {
  Bell,
  MessageSquare,
  Tag,
  Megaphone,
  BarChart3,
  Search,
  Flame,
  Package,
  Store,
  ClipboardList,
  Users,
  Wrench,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import type { Notification, NotificationType } from '@/types/notification.types';

export const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  NEW_MESSAGE: MessageSquare,
  FAV_AD_PRICE_CHANGED: Tag,
  FAV_AD_SOLD: Tag,
  PROMOTION: Megaphone,
  WEEKLY_AD_VIEWS_REPORT: BarChart3,
  WEEKLY_STORE_VIEWS_REPORT: BarChart3,
  WEEKLY_SERVICE_VIEWS_REPORT: BarChart3,
  SAVED_SEARCH_MATCH: Search,
  PROMOTION_STATUS_CHANGE: Flame,
  STORE_NEW_PRODUCT: Store,
  NEW_REQUEST_OFFER: ClipboardList,
  REQUEST_OFFER_ACCEPTED: ClipboardList,
  STORE_PROMOTION_STARTED: Flame,
  STORE_PRODUCT_RESTOCKED: Package,
  STORE_MEMBER_INVITED: Users,
  NEW_SERVICE_QUOTE: Wrench,
  SERVICE_QUOTE_ACCEPTED: Wrench,
  SERVICE_REQUEST_NEW: Wrench,
  SERVICE_REQUEST_UPDATE: Wrench,
  APPOINTMENT_UPDATE: CalendarClock,
};

export const TYPE_LABEL: Record<NotificationType, string> = {
  NEW_MESSAGE: 'رسائل',
  FAV_AD_PRICE_CHANGED: 'تغيير سعر',
  FAV_AD_SOLD: 'تم البيع',
  PROMOTION: 'ترويج',
  WEEKLY_AD_VIEWS_REPORT: 'تقرير مشاهدات إعلان',
  WEEKLY_STORE_VIEWS_REPORT: 'تقرير مشاهدات متجر',
  WEEKLY_SERVICE_VIEWS_REPORT: 'تقرير مشاهدات خدمة',
  SAVED_SEARCH_MATCH: 'بحث محفوظ',
  PROMOTION_STATUS_CHANGE: 'عرضي',
  STORE_NEW_PRODUCT: 'منتج جديد',
  NEW_REQUEST_OFFER: 'عرض جديد على طلبك',
  REQUEST_OFFER_ACCEPTED: 'تم قبول عرضك',
  STORE_PROMOTION_STARTED: 'عرض متجر',
  STORE_PRODUCT_RESTOCKED: 'عودة للمخزون',
  STORE_MEMBER_INVITED: 'دعوة متجر',
  NEW_SERVICE_QUOTE: 'عرض سعر خدمة',
  SERVICE_QUOTE_ACCEPTED: 'قبول عرض خدمة',
  SERVICE_REQUEST_NEW: 'طلب خدمة جديد',
  SERVICE_REQUEST_UPDATE: 'تحديث طلب خدمة',
  APPOINTMENT_UPDATE: 'موعد',
};

export type NotificationCategoryId =
  | 'all'
  | 'messages'
  | 'favorites'
  | 'stores'
  | 'services'
  | 'system';

export const NOTIFICATION_CATEGORIES: {
  id: NotificationCategoryId;
  label: string;
  types: NotificationType[] | null;
}[] = [
  { id: 'all', label: 'الكل', types: null },
  { id: 'messages', label: 'رسائل', types: ['NEW_MESSAGE'] },
  {
    id: 'favorites',
    label: 'مفضلة وبحث',
    types: ['FAV_AD_PRICE_CHANGED', 'FAV_AD_SOLD', 'SAVED_SEARCH_MATCH'],
  },
  {
    id: 'stores',
    label: 'متاجر',
    types: [
      'STORE_NEW_PRODUCT',
      'STORE_PROMOTION_STARTED',
      'STORE_PRODUCT_RESTOCKED',
      'PROMOTION_STATUS_CHANGE',
      'STORE_MEMBER_INVITED',
    ],
  },
  {
    id: 'services',
    label: 'خدمات',
    types: [
      'NEW_REQUEST_OFFER',
      'REQUEST_OFFER_ACCEPTED',
      'NEW_SERVICE_QUOTE',
      'SERVICE_QUOTE_ACCEPTED',
      'SERVICE_REQUEST_NEW',
      'SERVICE_REQUEST_UPDATE',
      'APPOINTMENT_UPDATE',
    ],
  },
  {
    id: 'system',
    label: 'النظام',
    types: [
      'PROMOTION',
      'WEEKLY_AD_VIEWS_REPORT',
      'WEEKLY_STORE_VIEWS_REPORT',
      'WEEKLY_SERVICE_VIEWS_REPORT',
    ],
  },
];

/** Minimal shape so live SSE payloads (no id/readAt) can be resolved too. */
export type HrefSource = Pick<Notification, 'type' | 'data'>;

export function hrefFor(notification: HrefSource): string | null {
  const d = notification.data;
  if (notification.type === 'NEW_MESSAGE' && d?.conversationId) {
    return ROUTES.conversationDetail(d.conversationId);
  }
  if (
    (notification.type === 'FAV_AD_PRICE_CHANGED' || notification.type === 'FAV_AD_SOLD') &&
    d?.adId
  ) {
    return ROUTES.adDetail(d.adId);
  }
  if (notification.type === 'SAVED_SEARCH_MATCH') {
    if (d?.adId) return ROUTES.adDetail(d.adId);
    if (d?.productId) return ROUTES.productDetail(d.productId);
    if (d?.listingId) return ROUTES.serviceDetail(d.listingId);
  }
  if (notification.type === 'PROMOTION_STATUS_CHANGE') {
    return ROUTES.myStorePromotions;
  }
  if (
    notification.type === 'STORE_PROMOTION_STARTED' ||
    notification.type === 'STORE_PRODUCT_RESTOCKED'
  ) {
    if (d?.productId) return ROUTES.productDetail(d.productId);
    if (d?.storeId) return ROUTES.storeDetail(d.storeId);
  }

  if (notification.type === 'NEW_REQUEST_OFFER' || notification.type === 'REQUEST_OFFER_ACCEPTED') {
    const rid = d?.requestId;
    if (rid) return ROUTES.request(rid);
    return ROUTES.requests;
  }
  if (notification.type === 'NEW_SERVICE_QUOTE' || notification.type === 'SERVICE_QUOTE_ACCEPTED') {
    if (d?.listingId) return ROUTES.serviceDetail(d.listingId);
    if (d?.broadcastId) return `/service-requests/${d.broadcastId}`;
    return ROUTES.notifications;
  }
  if (
    notification.type === 'SERVICE_REQUEST_NEW' ||
    notification.type === 'SERVICE_REQUEST_UPDATE' ||
    notification.type === 'APPOINTMENT_UPDATE'
  ) {
    // Same detail page for both parties — the backend authorizes either.
    if (d?.requestId) return ROUTES.serviceRequestDetail(d.requestId);
    return ROUTES.notifications;
  }
  if (notification.type === 'STORE_NEW_PRODUCT') {
    if (d?.productId) return ROUTES.productDetail(d.productId);
    if (d?.storeId) return ROUTES.storeDetail(d.storeId);
  }
  if (notification.type === 'STORE_MEMBER_INVITED') {
    return ROUTES.myStoreMembers;
  }
  if (
    notification.type === 'WEEKLY_AD_VIEWS_REPORT' ||
    notification.type === 'WEEKLY_STORE_VIEWS_REPORT' ||
    notification.type === 'WEEKLY_SERVICE_VIEWS_REPORT'
  ) {
    // ROUTE-FIX-01: mirror the push `url` the backend cron scripts send
    // (weeklyAdViewsReport → /dashboard, weeklyStoreViewsReport →
    // /my-store?tab=analytics, weeklyServiceViewsReport →
    // /my-services?tab=analytics) so in-app and push taps land the same place.
    if (notification.type === 'WEEKLY_STORE_VIEWS_REPORT') return ROUTES.myStoreAnalytics;
    if (notification.type === 'WEEKLY_SERVICE_VIEWS_REPORT') return ROUTES.myServiceProviderAnalytics;
    return ROUTES.dashboard;
  }
  if (notification.type === 'PROMOTION') {
    return ROUTES.home;
  }
  return null;
}

/** تجميع حسب اليوم للعرض في مركز الإشعارات */
export function dayBucketLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startMsg.getTime()) / 86_400_000);
  if (diffDays === 0) return 'اليوم';
  if (diffDays === 1) return 'أمس';
  if (diffDays < 7) return 'هذا الأسبوع';
  if (diffDays < 30) return 'هذا الشهر';
  return 'أقدم';
}

export function groupNotificationsByDay(items: Notification[]): { label: string; items: Notification[] }[] {
  const order: string[] = [];
  const map = new Map<string, Notification[]>();
  for (const n of items) {
    const label = dayBucketLabel(n.createdAt);
    const bucket = map.get(label);
    if (!bucket) {
      const fresh: Notification[] = [n];
      map.set(label, fresh);
      order.push(label);
    } else {
      bucket.push(n);
    }
  }
  return order.map((label) => ({ label, items: map.get(label) ?? [] }));
}

/**
 * Collapse near-identical consecutive notifications (same type + title)
 * into a single display row with a count — keeps the list scannable.
 */
export function groupNotificationsByContext(
  items: Notification[],
): { key: string; items: Notification[]; label: string }[] {
  const groups: { key: string; items: Notification[]; label: string }[] = [];
  for (const n of items) {
    const baseTitle = n.title;
    const key = `${n.type}:${baseTitle}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(n);
      const count = last.items.length;
      last.label = count > 1 ? `${count}× ${baseTitle}` : baseTitle;
    } else {
      groups.push({
        key,
        items: [n],
        label: baseTitle,
      });
    }
  }
  return groups;
}

/** Safe icon lookup — never returns undefined for unknown future types. */
export function iconFor(type: string): LucideIcon {
  return (TYPE_ICON as Record<string, LucideIcon>)[type] ?? Bell;
}

export function labelFor(type: string): string {
  return (TYPE_LABEL as Record<string, string>)[type] ?? 'إشعار';
}
