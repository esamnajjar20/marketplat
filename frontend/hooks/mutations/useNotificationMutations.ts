'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications.api';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryKeys';
import type { NotificationDevice } from '@/types/notification.types';

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

/** PATCH /notifications/:id/unread — إرجاع إشعار لغير مقروء. */
export function useMarkNotificationUnread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.markUnread(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

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

/** PATCH /notifications/devices/:kind/:id — إعادة تسمية جهاز في قائمة الأجهزة. */
export function useRenameNotificationDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (v: { kind: NotificationDevice['kind']; id: string; label: string }) =>
      notificationsApi.renameDevice(v.kind, v.id, v.label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.devices() });
      toast.success('تم تحديث اسم الجهاز');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/** DELETE /notifications/devices/:kind/:id — إيقاف الإشعارات على جهاز واحد. */
export function useRemoveNotificationDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (v: { kind: NotificationDevice['kind']; id: string }) =>
      notificationsApi.removeDevice(v.kind, v.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.devices() });
      toast.success('تم إيقاف الإشعارات على هذا الجهاز');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
