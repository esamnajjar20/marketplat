/**
 * Notifications API — maps to backend /api/v1/notifications/*.
 * Verified against notifications.routes.ts: every route is the caller's
 * own notifications only — there's no id-scoped GET, only list +
 * unread-count + the two mark-read actions.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type { Notification, NotificationsQuery } from '@/types/notification.types';

export const notificationsApi = {
  /** GET /notifications */
  getMine: (params?: NotificationsQuery) =>
    apiClient
      .get<ApiResponse<Notification[]>>('/notifications', { params })
      .then((r) => unwrapPaginated<Notification>(r)),

  /** GET /notifications/unread-count */
  getUnreadCount: () =>
    apiClient.get<ApiResponse<{ count: number }>>('/notifications/unread-count'),

  /** PATCH /notifications/:id/read */
  markRead: (id: string) =>
    apiClient.patch<ApiResponse<void>>(`/notifications/${id}/read`),

  /** PATCH /notifications/read-all */
  markAllRead: () =>
    apiClient.patch<ApiResponse<{ count: number }>>('/notifications/read-all'),
};
