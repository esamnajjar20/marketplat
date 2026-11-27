/**
 * مصدر واحد لأيقونات/تسميات/روابط/فئات الإشعارات —
 * تستهلكه NotificationBell و NotificationsPage.
 *
 * مزامنة كاملة مع prisma NotificationType.
 */
import {
  Bell,
  MessageSquare,
  Tag,
  Megaphone,
  BarChart3,
  Search,
  Package,
  Store,
  ClipboardList,
  Users,
  Wrench,
  CalendarClock,
  ShieldAlert,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import type { Notification, NotificationType } from '@/types/notification.types';
import { NOTIFICATION_CATEGORIES as SHARED_CATEGORIES, NOTIFICATION_TYPE_META, resolveNotificationTarget } from '@marketplat/contracts';
import type { NotificationCategory } from '@marketplat/contracts';

const ICON_BY_KEY: Record<(typeof NOTIFICATION_TYPE_META)[NotificationType]['icon'], LucideIcon> = {
  message: MessageSquare,
  user: Users,
  following: Users,
  tag: Tag,
  megaphone: Megaphone,
  chart: BarChart3,
  search: Search,
  store: Store,
  package: Package,
  clipboard: ClipboardList,
  service: Wrench,
  calendar: CalendarClock,
  shield: ShieldAlert,
  wallet: WalletCards,
};

export const TYPE_ICON: Record<NotificationType, LucideIcon> = Object.fromEntries(
  Object.entries(NOTIFICATION_TYPE_META).map(([type, meta]) => [type, ICON_BY_KEY[meta.icon]])
) as Record<NotificationType, LucideIcon>;

export const TYPE_LABEL: Record<NotificationType, string> = Object.fromEntries(
  Object.entries(NOTIFICATION_TYPE_META).map(([type, meta]) => [type, meta.label])
) as Record<NotificationType, string>;

export type NotificationCategoryId = 'all' | NotificationCategory;
export const NOTIFICATION_CATEGORIES = SHARED_CATEGORIES;

/** Minimal shape so live SSE payloads (no id/readAt) can be resolved too. */
export type HrefSource = Pick<Notification, 'type' | 'data'>;

export function hrefFor(notification: HrefSource): string | null {
  const target = resolveNotificationTarget(notification.type, notification.data);
  switch (target.kind) {
    case 'conversation': return target.id ? ROUTES.conversationDetail(target.id) : ROUTES.messages;
    case 'profile': return target.id ? ROUTES.userProfile(target.id) : '/profile';
    case 'following_feed': return ROUTES.following;
    case 'ad': return target.id ? ROUTES.adDetail(target.id) : ROUTES.favorites;
    case 'product': return target.id ? ROUTES.productDetail(target.id) : ROUTES.products;
    case 'service': return target.id ? ROUTES.serviceDetail(target.id) : ROUTES.services;
    case 'store': return target.id ? ROUTES.storeDetail(target.id) : ROUTES.stores;
    case 'saved_searches': return ROUTES.savedSearches;
    case 'store_members': return ROUTES.myStoreMembers;
    case 'request': return target.id ? ROUTES.request(target.id) : ROUTES.requests;
    case 'service_request': return target.id ? ROUTES.serviceRequestDetail(target.id) : ROUTES.notifications;
    case 'appointments': return ROUTES.myServiceAppointments;
    case 'order': return target.id ? ROUTES.marketplaceOrder(target.id) : ROUTES.orders;
    case 'orders': return ROUTES.orders;
    case 'sale': return target.id ? `/account/sales/${encodeURIComponent(target.id)}/receipt` : ROUTES.sales;
    case 'installments': return ROUTES.salesInstallments;
    case 'debts': return ROUTES.salesDebts;
    case 'sales': return ROUTES.sales;
    case 'store_promotions': return ROUTES.myStorePromotions;
    case 'dashboard': return ROUTES.dashboard;
    case 'store_analytics': return ROUTES.myStoreAnalytics;
    case 'service_analytics': return ROUTES.myServiceProviderAnalytics;
    case 'reports': return ROUTES.myReports;
    case 'home': return ROUTES.home;
    case 'favorites': return ROUTES.favorites;
    case 'notifications': return ROUTES.notifications;
    default: return null;
  }
}

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
