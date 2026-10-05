'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  listQueuedMessages,
  QUEUE_MESSAGE_EVENT_TYPES,
  type QueuedMessageEntry,
} from '@/lib/offlineMessagesQueue';
import { QUEUE_UPDATED_EVENT } from '@/hooks/useQueuedRequestCount';

/**
 * FEAT-OFFLINE-MSG: رسائل هذه المحادثة الموجودة حاليًا بطابور الأوفلاين
 * (لم تصل السيرفر بعد) — pending (بانتظار الاتصال) أو failed (رُفضت
 * نهائيًا). ChatWindow يدمج هذه القائمة مع الرسائل الحقيقية القادمة من
 * useMessages فيعرضها كفقاعات "جارٍ الإرسال" / "فشل الإرسال".
 *
 * نفس نمط useQueuedRequestCount (قراءة أولى + الاشتراك بأحداث الـ SW +
 * حدث 'offline-queue:queued' اللحظي من client.ts) لكن مُصفّاة على محادثة
 * واحدة ومُعادة كرسائل فعلية لا مجرد عدد.
 */
export function usePendingMessages(conversationId: string): QueuedMessageEntry[] {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<QueuedMessageEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      listQueuedMessages(conversationId)
        .then((items) => {
          if (!cancelled) setMessages(items);
        })
        .catch(() => undefined);
    }

    refresh();

    function onSwMessage(event: MessageEvent) {
      const type = event.data?.type;
      if (QUEUE_MESSAGE_EVENT_TYPES.includes(type)) {
        refresh();
        if (type === 'QUEUE_ITEM_SENT') {
          void queryClient.invalidateQueries({ queryKey: ['conversations', 'detail', conversationId, 'messages'] });
          void queryClient.invalidateQueries({ queryKey: ['conversations', 'me'] });
          void queryClient.invalidateQueries({ queryKey: ['conversations', 'detail', conversationId, 'media'] });
        }
      }
    }

    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    window.addEventListener(QUEUE_UPDATED_EVENT, refresh);
    window.addEventListener('online', refresh);

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      window.removeEventListener(QUEUE_UPDATED_EVENT, refresh);
      window.removeEventListener('online', refresh);
    };
  }, [conversationId, queryClient]);

  return messages;
}
