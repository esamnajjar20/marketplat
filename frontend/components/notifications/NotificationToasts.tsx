'use client';

/**
 * Critical notification toasts.
 * Prefer live SSE events; still safe if stream is down (poll still updates badge).
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useNotificationStream, type LiveStreamPayload } from '@/hooks/useNotificationStream';
import { ROUTES } from '@/lib/constants';
import { hrefFor } from '@/lib/notificationMeta';
import type { NotificationType } from '@/types/notification.types';

// FIX NOTIF-TOAST-CRITICAL-SYNC-01: the Open Requests marketplace
// produces NEW_REQUEST_OFFER (offer arrived on my request) and
// REQUEST_OFFER_ACCEPTED (my offer was accepted) — the two most
// time-sensitive events in that flow, since a customer or provider
// waiting on the other side wants to know immediately. Missing from
// the set, they only surfaced in the notification list page.
const CRITICAL = new Set<string>([
  'NEW_MESSAGE',
  'FAV_AD_SOLD',
  'FAV_AD_PRICE_CHANGED',
  'NEW_REQUEST_OFFER',
  'REQUEST_OFFER_ACCEPTED',
]);

export function NotificationToasts() {
  const router = useRouter();

  const onEvent = useCallback(
    (event: LiveStreamPayload) => {
      // message:new is applied to ChatWindow via the stream hook cache update.
      // Toast only for notification events (avoid double noise while chatting).
      if (event.type !== 'notification') return;
      if (event.action !== 'created' && event.action !== 'updated') return;
      if (!event.notificationType || !CRITICAL.has(event.notificationType)) return;

      const type = event.notificationType as NotificationType;
      // Deep link from the event's own data; fall back to the old coarse
      // targets when an older server (or a uniform fan-out) sends no data.
      const href: string =
        hrefFor({ type, data: event.data ?? null }) ??
        (type === 'NEW_MESSAGE' ? ROUTES.messages : ROUTES.notifications);

      // Already looking at the target → the toast would only cover it.
      if (typeof window !== 'undefined') {
        try {
          if (window.location.pathname === new URL(href, window.location.origin).pathname) return;
        } catch {
          /* malformed href — show the toast */
        }
      }

      toast(event.title ?? 'إشعار جديد', {
        description: event.body,
        action: {
          label: 'عرض',
          onClick: () => router.push(href),
        },
      });
    },
    [router],
  );

  useNotificationStream({ onEvent });
  return null;
}
