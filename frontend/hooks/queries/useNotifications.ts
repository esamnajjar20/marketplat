'use client';

import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import type { NotificationsQuery } from '@/types/notification.types';

/** GET /notifications — powers NotificationsDropdown's list. */
export function useMyNotifications(params?: NotificationsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.notifications.mine(params),
    queryFn: () => notificationsApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.notifications,
    refetchInterval: CACHE_TTL.notifications,
    enabled: isAuthenticated,
  });
}

/** GET /notifications/unread-count — powers NotificationBell's badge.
 * Polls independently of useMyNotifications so the badge count stays
 * live even on pages that never mount the dropdown's list. */
export function useUnreadNotificationCount() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: () => notificationsApi.getUnreadCount().then((r) => r.data.data?.count ?? 0),
    staleTime: CACHE_TTL.notifications,
    refetchInterval: CACHE_TTL.notifications,
    enabled: isAuthenticated,
  });
}
