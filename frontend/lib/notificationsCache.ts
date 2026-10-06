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
/** FIX NOTIF-CACHE-TTL: 7 أيام — إشعار أقدم من ذلك قد يكون مضللاً عند
 * القراءة أوفلاين. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * FIX NOTIF-CACHE-USER: معرّف المستخدم الحالي — يُقرأ من Zustand persist
 * في localStorage (نفس نمط paymentStorage). يُخزَّن مع البيانات لمنع
 * عرض إشعارات User A لـ User B في الـ flash القصير قبل أن يُكمل
 * clearSensitiveLocalData عمله.
 */
function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('marketplace-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { user?: { id?: string } } };
    return parsed?.state?.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface NotificationsCacheData {
  items: Notification[];
  unreadCount: number;
  /** وقت آخر تحديث لهذه النسخة المحلية */
  savedAt: string;
  /** FIX NOTIF-CACHE-USER: مالك البيانات. null لعناصر قديمة. */
  userId?: string | null;
}

const EMPTY: NotificationsCacheData = { items: [], unreadCount: 0, savedAt: '' };

function readCache(): NotificationsCacheData {
  const cache = localGet<NotificationsCacheData>(KEY, EMPTY);
  // FIX NOTIF-CACHE-TTL: إن انتهت صلاحية النسخة → تعاملها كـ فارغة.
  if (!cache.savedAt) return EMPTY;
  const saved = Date.parse(cache.savedAt);
  if (!Number.isFinite(saved) || Date.now() - saved > TTL_MS) return EMPTY;
  // FIX NOTIF-CACHE-USER: رفض لو البيانات لمستخدم آخر.
  const uid = getCurrentUserId();
  if ((cache.userId ?? null) !== uid) return EMPTY;
  return cache;
}

/** حفظ/تحديث آخر إشعارات مجلوبة من الخادم بنجاح. */
export function saveNotificationsItemsCache(items: Notification[]): void {
  const prev = readCache();
  localSet(KEY, {
    ...prev,
    userId: getCurrentUserId(),
    items: items.slice(0, MAX_ITEMS),
    savedAt: new Date().toISOString(),
  } satisfies NotificationsCacheData);
}

export function saveUnreadCountCache(count: number): void {
  const prev = readCache();
  localSet(KEY, {
    ...prev,
    userId: getCurrentUserId(),
    unreadCount: count,
    savedAt: new Date().toISOString(),
  } satisfies NotificationsCacheData);
}

export function getNotificationsCache(): NotificationsCacheData | null {
  const cache = readCache();
  return cache.savedAt ? cache : null;
}

export function clearNotificationsCache(): void {
  localRemove(KEY);
}
