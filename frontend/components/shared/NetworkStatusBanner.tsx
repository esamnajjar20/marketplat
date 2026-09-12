'use client';

/**
 * شريط حالة الشبكة — موحّد في أسفل الشاشة.
 *
 * - أوفلاين: يبقى ظاهرًا طوال مدة الانقطاع (نص واضح وحجم مناسب).
 * - عودة الاتصال: إشعار أخضر مؤقت ثم يختفي تلقائيًا.
 *
 * FIX NETWORK-BANNER-UNIFY-01: كانت «غير متصل» شارة صغيرة فوق زر القائمة
 * في BottomNav (نص 9px)، و«عاد الاتصال» شريط أعلى الصفحة — مكانان
 * وأحجام مختلفة. الآن الاثنان في نفس الموضع (أسفل، فوق BottomNav على
 * الموبايل) بنفس أسلوب الشريط.
 */

import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';

const BACK_ONLINE_DURATION_MS = 3500;

export function NetworkStatusBanner() {
  const isOnline = useOnlineStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOnlineRef = useRef(isOnline);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  useEffect(() => {
    // انتقال فعلي من غير-متصل → متصل فقط (لا عند التركيب الأول وهو متصل).
    if (!wasOnlineRef.current && isOnline) {
      clearHideTimer();
      setShowBackOnline(true);
      hideTimerRef.current = setTimeout(() => {
        setShowBackOnline(false);
        hideTimerRef.current = null;
      }, BACK_ONLINE_DURATION_MS);
    }
    if (!isOnline) {
      clearHideTimer();
      setShowBackOnline(false);
    }
    wasOnlineRef.current = isOnline;
    return clearHideTimer;
  }, [isOnline]);

  function dismissBackOnline() {
    clearHideTimer();
    setShowBackOnline(false);
  }

  const showOffline = !isOnline;
  const visible = showOffline || showBackOnline;
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // أسفل الشاشة، فوق BottomNav على الموبايل (ارتفاع الشريط ~3.5rem + safe area)
        'fixed inset-x-0 z-[100] flex items-center justify-center gap-2 px-4 py-3 text-center text-sm font-medium shadow-lg sm:text-base',
        'bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))]',
        'mx-3 mb-1 max-w-lg rounded-xl md:mx-auto',
        showOffline
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-emerald-600 text-white',
      )}
    >
      <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-2.5 pe-6">
        {showOffline ? (
          <WifiOff className="h-5 w-5 shrink-0 sm:h-5 sm:w-5" aria-hidden />
        ) : (
          <Wifi className="h-5 w-5 shrink-0" aria-hidden />
        )}
        <span className="leading-snug">
          {showOffline ? 'لا يوجد اتصال بالإنترنت' : 'عاد الاتصال'}
        </span>
      </span>
      {showBackOnline && (
        <button
          type="button"
          onClick={dismissBackOnline}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 opacity-90 transition hover:bg-black/15 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          aria-label="إغلاق الرسالة"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
