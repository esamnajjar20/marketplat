'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications.api';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';

/**
 * PATCH /notifications/:id/read — fires when the caller clicks a
 * notification row in the dropdown (ChatWindow-style "opening it is
 * the read receipt", but here it's an explicit click since a
 * notification is a single discrete item, not a scrolling thread).
 * No error toast on failure — a failed mark-read is invisible/low-stakes
 * enough that surfacing it would be more annoying than useful; the
 * badge just stays accurate on the next poll either way.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** PATCH /notifications/read-all — the dropdown's "تعليم الكل كمقروء". */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllRead().then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/** DELETE /notifications/:id */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.deleteOne(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/** DELETE /notifications/read — clear every read notification. */
export function useDeleteAllReadNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.deleteAllRead().then((r) => r.data.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      const count = data?.count ?? 0;
      toast.success(count > 0 ? `تم حذف ${count} إشعاراً مقروءاً` : 'لا توجد إشعارات مقروءة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
