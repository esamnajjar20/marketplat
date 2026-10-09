'use client';
import { reportBackgroundFailure } from '../lib/backgroundTask';

import { useEffect, useState } from 'react';
import { getQueuedRequestCount } from '@/lib/offlineQueue';
import { useAuthStore } from '@/store/auth.store';
import { subscribeNetworkLifecycle } from '@/lib/networkLifecycle';

/**
 * عدّاد "طلبات بالانتظار" كان يُقرأ فقط داخل صفحة
 * /offline نفسها (getQueuedRequestCount مستخدَمة هناك حصرًا) — لو المستخدم
 * نشر إعلانًا أوفلاين ثم تنقّل لصفحة أخرى، ما في أي إشارة دائمة تذكّره أن
 * هناك عملية معلَّقة، رغم أن sw.js يبعث أصلًا رسالة QUEUE_REPLAYED لكل
 * التبويبات المفتوحة بعد إعادة إرسال الطابور بنجاح. هذا الـ hook يجعل
 * العدّاد متاحًا بأي مكان بالتطبيق.
 *
 * مصادر إعادة القراءة:
 *  - التركيب الأول (قد تكون هناك طلبات معلّقة من جلسة سابقة).
 *  - رسالة 'QUEUE_REPLAYED' من الـ SW (بعد نجاح — العدّاد غالبًا صفر أو أقل).
 *  - الحدث المخصّص 'offline-queue:queued' الذي يُطلقه api/client.ts's
 *    response interceptor فور استلام 202 {queued:true} — هذه اللحظة
 *    الوحيدة بالصفحة التي "تعرف" أن عنصرًا جديدًا انضم للطابور، لأن الطابور
 *    نفسه (IndexedDB) يُدار بالكامل داخل sw.js ولا يبعث رسالة عند الإضافة.
 *  - حدث 'online' كـ fallback احترازي (مثلًا لو فاتت رسالة QUEUE_REPLAYED).
 *
 * getQueuedRequestCount (lib/offlineQueue.ts) أصبحت
 * تُرجع عدد العناصر "المعلّقة فعلًا" فقط (تستبعد status:'failed' التي لن
 * تُعاد تلقائيًا أبدًا — انظر تعليق ذلك الملف للتفصيل الكامل)، فالرقم هنا
 * أصبح دقيقًا فعلًا لشارة "N بالانتظار" — سابقًا كان يشمل عناصر فاشلة
 * بصمت، فيَعِد المستخدم بإرسال تلقائي لن يحدث لتلك العناصر تحديدًا.
 * العناصر الفاشلة (غير رسائل المحادثة) لها الآن واجهة مستقلة بصفحة
 * /offline (listFailedRequests/retryFailedRequest/discardFailedRequest).
 */
export const QUEUE_UPDATED_EVENT = 'offline-queue:queued';

export function useQueuedRequestCount(): number {
  const [count, setCount] = useState(0);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      getQueuedRequestCount()
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch((error) => reportBackgroundFailure('frontend/hooks/useQueuedRequestCount.ts', error));
    }

    refresh();

    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === 'QUEUE_REPLAYED') refresh();
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
  }, [userId]);

  return count;
}
