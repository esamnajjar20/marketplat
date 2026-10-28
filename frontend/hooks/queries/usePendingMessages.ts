'use client';
import { reportBackgroundFailure } from '../../lib/backgroundTask';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  listQueuedMessages,
  QUEUE_MESSAGE_EVENT_TYPES,
  type QueuedMessageEntry,
} from '@/lib/offlineMessagesQueue';
import { QUEUE_UPDATED_EVENT } from '@/hooks/useQueuedRequestCount';
import { subscribeNetworkLifecycle } from '@/lib/networkLifecycle';

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
        .catch((error) => reportBackgroundFailure('frontend/hooks/queries/usePendingMessages.ts', error));
    }

    refresh();

    function onSwMessage(event: MessageEvent) {
      const type = event.data?.type;
      if (QUEUE_MESSAGE_EVENT_TYPES.includes(type)) {
        refresh();
        if (type === 'QUEUE_ITEM_SENT') {
          void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.messagesRoot(conversationId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.mineRoot() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.media(conversationId) });
        }
      }
    }

    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    window.addEventListener(QUEUE_UPDATED_EVENT, refresh);
    const unsubscribeNetwork = subscribeNetworkLifecycle((event) => {
      if (event.type === 'online') refresh();
    });

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      window.removeEventListener(QUEUE_UPDATED_EVENT, refresh);
      unsubscribeNetwork();
    };
  }, [conversationId, queryClient]);

  return messages;
}
