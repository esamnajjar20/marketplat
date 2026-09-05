/**
 * تخزين محلي لآخر الإشعارات + عدد غير المقروء — لقراءتها بدون إنترنت من
 * صفحة الإشعارات وجرس الإشعارات.
 *
 * يُحدَّث تلقائيًا في hooks/queries/useNotifications.ts كلما نجح طلب من
 * الخادم، ويُقرأ كـ initialData لنفس الـ hooks حتى تظهر آخر نسخة محفوظة
 * فورًا (بدل شاشة فارغة/خطأ) عند فتح الصفحة بدون اتصال. عند عودة الاتصال
 * يُعاد الجلب تلقائيًا (سلوك TanStack Query الافتراضي refetchOnReconnect)
 * وتُحدَّث هذه النسخة المحلية من جديد.
 */

import { localGet, localSet, localRemove } from '@/lib/localStore';
import type { Notification } from '@/types/notification.types';

const KEY = 'notifications-cache';
/** أقصى عدد إشعارات يُحتفظ به محليًا — يكفي لعرض قائمة مفيدة بدون تضخيم localStorage. */
const MAX_ITEMS = 30;

export interface NotificationsCacheData {
  items: Notification[];
  unreadCount: number;
  /** وقت آخر تحديث لهذه النسخة المحلية */
  savedAt: string;
}

const EMPTY: NotificationsCacheData = { items: [], unreadCount: 0, savedAt: '' };

function readCache(): NotificationsCacheData {
  return localGet<NotificationsCacheData>(KEY, EMPTY);
}

/** حفظ/تحديث آخر إشعارات مجلوبة من الخادم بنجاح. */
export function saveNotificationsItemsCache(items: Notification[]): void {
  const prev = readCache();
  localSet(KEY, {
    ...prev,
    items: items.slice(0, MAX_ITEMS),
    savedAt: new Date().toISOString(),
  } satisfies NotificationsCacheData);
}

/** حفظ/تحديث عدد الإشعارات غير المقروءة. */
export function saveUnreadCountCache(count: number): void {
  const prev = readCache();
  localSet(KEY, {
    ...prev,
    unreadCount: count,
    savedAt: new Date().toISOString(),
  } satisfies NotificationsCacheData);
}

/** قراءة آخر نسخة محفوظة محليًا — null إن لم يسبق حفظ أي شيء. */
export function getNotificationsCache(): NotificationsCacheData | null {
  const cache = readCache();
  return cache.savedAt ? cache : null;
}

export function clearNotificationsCache(): void {
  localRemove(KEY);
}
