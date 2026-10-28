'use client';
import { reportBackgroundFailure } from '../lib/backgroundTask';

/**
 * DRAFTS-BADGE-01: عدد المسودات المعلّقة (draft | pending_sync | failed)
 * لمستخدم مسجّل — يُستخدَم كشارة على زر + في BottomNav.
 *
 * يستمع لـ:
 *  - 'offline-drafts:updated' من lib/offlineAdDrafts.ts بعد كل mutation.
 *  - 'online' كـ fallback.
 *  - رسالة QUEUE_REPLAYED من الـ SW (بعد نجاح إرسال دفعة).
 *  - visibilitychange عند العودة من tab آخر.
 */
import { useEffect, useState } from 'react';
import { countPendingAdDrafts } from '@/lib/offlineAdDrafts';
import { subscribeNetworkLifecycle } from '@/lib/networkLifecycle';

const DRAFTS_UPDATED_EVENT = 'offline-drafts:updated';

export function usePendingDraftsCount(userId: string | null | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) { setCount(0); return; }
    let cancelled = false;

    function refresh() {
      countPendingAdDrafts(userId)
        .then((n) => { if (!cancelled) setCount(n); })
        .catch((error) => reportBackgroundFailure('frontend/hooks/usePendingDraftsCount.ts', error));
    }

    refresh();

    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === 'QUEUE_REPLAYED') refresh();
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') refresh();
    }

    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    window.addEventListener(DRAFTS_UPDATED_EVENT, refresh);
    const unsubscribeNetwork = subscribeNetworkLifecycle((event) => {
      if (event.type === 'online') refresh();
    });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      window.removeEventListener(DRAFTS_UPDATED_EVENT, refresh);
      unsubscribeNetwork();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId]);

  return count;
}
