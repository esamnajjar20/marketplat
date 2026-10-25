'use client';

import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications.api';
import { queryKeys } from '@/lib/queryKeys';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';

/**
 * GET /notifications/devices — قائمة الأجهزة المسجّلة لإشعارات الدفع.
 * بلا polling: القائمة تتغيّر فقط بفعل المستخدم نفسه (تفعيل/إيقاف/حذف)،
 * وكل mutation تُبطل هذا المفتاح.
 */
export function useNotificationDevices() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);

  return useQuery({
    queryKey: queryKeys.notifications.devices(),
    queryFn: () => notificationsApi.getDevices().then((r) => r.data.data ?? []),
    enabled: isAuthenticated && hasToken,
    staleTime: 30_000,
  });
}
