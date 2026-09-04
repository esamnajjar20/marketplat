'use client';

/**
 * شريط حالة الشبكة — أعلى الصفحة، مؤقت، وقابل للإغلاق.
 *
 * FIX PERSISTENT-OFFLINE-BADGE: حالة "غير متصل" لم تعد تُعرض هنا كرسالة
 * حمراء مؤقتة (8 ثوانٍ) تختفي رغم استمرار انقطاع الاتصال — استُبدلت بإشارة
 * دائمة فوق زر القائمة (BottomNav.tsx) تبقى ظاهرة طوال مدة الانقطاع الفعلية
 * لا فترة ثابتة. هذا الملف الآن يعرض فقط تأكيد "عاد الاتصال" العابر (وهو
 * إشعار إيجابي عابر بطبيعته، لا حالة مستمرة تحتاج إشارة دائمة).
 */

import { useEffect, useRef, useState } from 'react';
import { Wifi, X } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const BACK_DURATION_MS = 3500;

export function NetworkStatusBanner() {
  const isOnline = useOnlineStatus();
  const [visible, setVisible] = useState(false);
  const wasOnlineRef = useRef(isOnline);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  useEffect(() => {
    // انتقال فعلي من غير-متصل إلى متصل فقط — لا نعرضها عند التركيب الأول
    // حتى لو كان المستخدم متصلًا أصلًا (لا يوجد "عودة" لعرضها هنا).
    if (!wasOnlineRef.current && isOnline) {
      clearHideTimer();
      setVisible(true);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        hideTimerRef.current = null;
      }, BACK_DURATION_MS);
    }
    wasOnlineRef.current = isOnline;

    return clearHideTimer;
  }, [isOnline]);

  function dismiss() {
    clearHideTimer();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-sm shadow-md bg-emerald-600 text-white"
    >
      <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 pe-8">
        <Wifi className="h-4 w-4 shrink-0" aria-hidden />
        <span className="leading-snug">عاد الاتصال</span>
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 opacity-90 transition hover:bg-black/15 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        aria-label="إغلاق الرسالة"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
