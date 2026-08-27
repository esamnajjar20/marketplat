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
import type { NotificationType } from '@/types/notification.types';

const CRITICAL = new Set<string>([
  'NEW_MESSAGE',
  'NEW_SERVICE_QUOTE',
  'SERVICE_QUOTE_ACCEPTED',
  'FAV_AD_SOLD',
  'FAV_AD_PRICE_CHANGED',
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
      let href: string = ROUTES.notifications;
      if (type === 'NEW_MESSAGE') href = ROUTES.messages;

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
