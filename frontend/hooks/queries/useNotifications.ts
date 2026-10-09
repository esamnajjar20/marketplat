'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { offlineMeta } from '@/lib/apiPagination';

/**
 * GET /notifications — powers NotificationsDropdown's list.
 *
 * OFFLINE: للطلب غير المُصفّى (بدون unreadOnly، وهو ما تعرضه صفحة
 * الإشعارات وتبني منه تبويب "غير مقروء" محليًا) تُبذَر أحدث نسخة محفوظة
 * بعد أول render في المتصفح، حتى تبقى HTML الخادم وأول render للعميل
 * متطابقين. وتُحدَّث النسخة المحلية تلقائيًا كلما نجح طلب جديد من الخادم.
 */
export function useMyNotifications(params?: NotificationsQuery, options?: { enabled?: boolean }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  // FIX NOTIFICATIONS-OFFLINE-CACHE-SCOPE-01: the cache-seeding
  // guard only checked unreadOnly, but NotificationsQuery
  // (types/notification.types.ts) also carries type and category
  // filters. A type-filtered first page (?type=MESSAGE, page 1) or
  // a category-filtered one (?category=messages, page 1) was being
  // written into the generic notifications cache, so a later
  // unfiltered offline open of /notifications showed only that
  // subset. Same class as ADS-OFFLINE-CACHE-SCOPE-01/-02 and
  // APPT-OFFLINE-CACHE-SCOPE-01.
  const isBaseView =
    !params?.unreadOnly &&
    !params?.type &&
    !params?.category;
  const queryClient = useQueryClient();
  const queryKey = queryKeys.notifications.mine(params);
  const queryKeyJson = JSON.stringify(queryKey);

  // Hydration-safe offline seed: the browser-only notification snapshot is
  // applied after the first render, never as render-time initialData.
  useEffect(() => {
    if (!isBaseView) return;
    let stableKey: readonly unknown[];
    try { stableKey = JSON.parse(queryKeyJson) as readonly unknown[]; } catch { return; }
    if (queryClient.getQueryData(stableKey) !== undefined) return;
    const cached = getNotificationsCache();
    if (!cached?.items.length) return;
    const savedAt = Date.parse(cached.savedAt);
    queryClient.setQueryData(
      stableKey,
      { items: cached.items, meta: offlineMeta(cached.items.length) },
      { updatedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : Date.now() },
    );
  }, [isBaseView, queryClient, queryKeyJson]);

  const query = useQuery({
    queryKey,
    queryFn: () => notificationsApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.notifications,
    // SSE updates the inbox; poll is a slow backup, paused when hidden/offline.
    refetchInterval: () => pollingInterval(CACHE_TTL.notifications, 8, true),
    enabled: (options?.enabled ?? true) && isAuthenticated && (hasToken || !isOnline),
  });

  useEffect(() => {
    if (isBaseView && query.data?.items) {
      saveNotificationsItemsCache(query.data.items);
    }
  }, [isBaseView, query.data]);

  return query;
}

/** GET /notifications/unread-count — powers NotificationBell's badge.
 * OFFLINE: تُبذَر من آخر عدد محفوظ محليًا بعد أول render، وتُحدَّث النسخة
 * المحلية كلما نجح طلب جديد. */
export function useUnreadNotificationCount() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.notifications.unreadCount();
  const queryKeyJson = JSON.stringify(queryKey);

  // Keep the first SSR/client render deterministic while retaining offline
  // badge availability as soon as hydration has completed.
  useEffect(() => {
    let stableKey: readonly unknown[];
    try { stableKey = JSON.parse(queryKeyJson) as readonly unknown[]; } catch { return; }
    if (queryClient.getQueryData(stableKey) !== undefined) return;
    const cached = getNotificationsCache();
    if (!cached || typeof cached.unreadCount !== 'number') return;
    const savedAt = Date.parse(cached.savedAt);
    queryClient.setQueryData(
      stableKey,
      cached.unreadCount,
      { updatedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : Date.now() },
    );
  }, [queryClient, queryKeyJson]);

  const query = useQuery({
    queryKey,
    queryFn: () => notificationsApi.getUnreadCount().then((r) => r.data.data?.count ?? 0),
    staleTime: CACHE_TTL.notifications,
    refetchInterval: () => pollingInterval(CACHE_TTL.notifications, 8, true),
    enabled: isAuthenticated && (hasToken || !isOnline),
  });

  useEffect(() => {
    if (typeof query.data === 'number') {
      saveUnreadCountCache(query.data);
      // PWA icon badge — best-effort; no-op if Badging API missing
      void import('@/lib/appBadge')
        .then(({ setAppBadgeCount }) => {
          setAppBadgeCount(query.data as number);
        })
        .catch(() => { /* UNHANDLED-CATCH-FIX — badge is best-effort */ });
    }
  }, [query.data]);

  return query;
}

