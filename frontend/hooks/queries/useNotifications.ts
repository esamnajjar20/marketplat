'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { pollingInterval } from '@/lib/polling';
import {
  getNotificationsCache,
  saveNotificationsItemsCache,
  saveUnreadCountCache,
} from '@/lib/notificationsCache';
import type { NotificationsQuery } from '@/types/notification.types';
import type { PaginationMeta } from '@/types/api.types';

/** ميتا افتراضية لبيانات القراءة بدون اتصال — لا صفحات أخرى معروفة فعليًا،
 * فقط ما هو محفوظ محليًا. */
function offlineMeta(count: number): PaginationMeta {
  return {
    total: count,
    page: 1,
    limit: count,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };
}

/**
 * GET /notifications — powers NotificationsDropdown's list.
 *
 * OFFLINE: للطلب غير المُصفّى (بدون unreadOnly، وهو ما تعرضه صفحة
 * الإشعارات وتبني منه تبويب "غير مقروء" محليًا) تُبذَر بأحدث نسخة محفوظة
 * في notificationsCache.ts كـ initialData — فتظهر فورًا حتى بدون اتصال —
 * وتُحدَّث هذه النسخة المحلية تلقائيًا كلما نجح طلب جديد من الخادم. عند
 * عودة الاتصال يُعاد الجلب تلقائيًا (refetchOnReconnect الافتراضي في
 * TanStack Query) فتتحدّث القائمة والنسخة المحلية معًا.
 */
export function useMyNotifications(params?: NotificationsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const isBaseView = !params?.unreadOnly;
  const cached = isBaseView ? getNotificationsCache() : null;

  const query = useQuery({
    queryKey: queryKeys.notifications.mine(params),
    queryFn: () => notificationsApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.notifications,
    // SSE updates the inbox; poll is a slow backup, paused when hidden/offline.
    refetchInterval: () => pollingInterval(CACHE_TTL.notifications, 4),
    enabled: isAuthenticated && (hasToken || !isOnline),
    ...(cached && cached.items.length > 0
      ? {
          initialData: { items: cached.items, meta: offlineMeta(cached.items.length) },
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
  });

  useEffect(() => {
    if (isBaseView && query.data?.items) {
      saveNotificationsItemsCache(query.data.items);
    }
  }, [isBaseView, query.data]);

  return query;
}

/** GET /notifications/unread-count — powers NotificationBell's badge.
 * OFFLINE: نفس منطق useMyNotifications — تُبذَر من آخر عدد محفوظ محليًا،
 * وتُحدَّث النسخة المحلية كلما نجح طلب جديد. */
export function useUnreadNotificationCount() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const cached = getNotificationsCache();

  const query = useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: () => notificationsApi.getUnreadCount().then((r) => r.data.data?.count ?? 0),
    staleTime: CACHE_TTL.notifications,
    refetchInterval: () => pollingInterval(CACHE_TTL.notifications, 4),
    enabled: isAuthenticated && (hasToken || !isOnline),
      ...(cached && typeof cached.unreadCount === 'number'
      ? {
          initialData: cached.unreadCount,
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
  });

  useEffect(() => {
    if (typeof query.data === 'number') {
      saveUnreadCountCache(query.data);
      // PWA icon badge — best-effort; no-op if Badging API missing
      void import('@/lib/appBadge').then(({ setAppBadgeCount }) => {
        setAppBadgeCount(query.data as number);
      });
    }
  }, [query.data]);

  return query;
}

