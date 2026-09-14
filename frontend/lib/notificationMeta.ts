/**
 * مصدر واحد لأيقونات/تسميات/روابط/فئات الإشعارات —
 * تستهلكه NotificationBell و NotificationsPage.
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
  SAVED_SEARCH_MATCH: Search,
  PROMOTION_STATUS_CHANGE: Flame,
  STORE_NEW_PRODUCT: Store,
  STORE_PROMOTION_STARTED: Flame,
  STORE_PRODUCT_RESTOCKED: Package,
  NEW_SERVICE_QUOTE: ClipboardList,
  SERVICE_QUOTE_ACCEPTED: ClipboardList,
  STORE_MEMBER_INVITED: Users,
};

export const TYPE_LABEL: Record<NotificationType, string> = {
  NEW_MESSAGE: 'رسائل',
  FAV_AD_PRICE_CHANGED: 'تغيير سعر',
  FAV_AD_SOLD: 'تم البيع',
  PROMOTION: 'ترويج',
  WEEKLY_AD_VIEWS_REPORT: 'تقرير مشاهدات',
  SAVED_SEARCH_MATCH: 'بحث محفوظ',
  PROMOTION_STATUS_CHANGE: 'عرضي',
  STORE_NEW_PRODUCT: 'منتج جديد',
  STORE_PROMOTION_STARTED: 'عرض متجر',
  STORE_PRODUCT_RESTOCKED: 'عودة للمخزون',
  NEW_SERVICE_QUOTE: 'عرض سعر',
  SERVICE_QUOTE_ACCEPTED: 'قبول عرض',
  STORE_MEMBER_INVITED: 'دعوة متجر',
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
    types: ['NEW_SERVICE_QUOTE', 'SERVICE_QUOTE_ACCEPTED'],
  },
  {
    id: 'system',
    label: 'النظام',
    types: ['PROMOTION', 'WEEKLY_AD_VIEWS_REPORT'],
  },
];

export function hrefFor(notification: Notification): string | null {
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
  if (notification.type === 'STORE_NEW_PRODUCT' && d?.storeId) {
    return ROUTES.storeDetail(d.storeId);
  }
  if (
    (notification.type === 'NEW_SERVICE_QUOTE' ||
      notification.type === 'SERVICE_QUOTE_ACCEPTED') &&
    d?.broadcastId
  ) {
    return `/service-broadcasts/${d.broadcastId}`;
  }
  if (notification.type === 'STORE_MEMBER_INVITED') {
    return ROUTES.myStoreMembers;
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
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(n);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}

export { Bell };
