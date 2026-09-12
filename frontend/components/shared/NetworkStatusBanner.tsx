'use client';

/**
 * شريط حالة الشبكة — أسفل الشاشة.
 *
 * - أوفلاين: شريط كامل «لا يوجد اتصال بالإنترنت» لمدة 3 ثوانٍ، ثم يتحوّل
 *   بأنيميشن لشارة جانبية ثابتة «غير متصل».
 * - عودة الاتصال: شريط أخضر «عاد الاتصال» مؤقت ثم يختفي.
 */

import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';

const BACK_ONLINE_DURATION_MS = 3500;
const OFFLINE_FULL_DURATION_MS = 3000;

type OfflinePhase = 'full' | 'compact';

export function NetworkStatusBanner() {
  const isOnline = useOnlineStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [offlinePhase, setOfflinePhase] = useState<OfflinePhase | null>(null);
  const wasOnlineRef = useRef(isOnline);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function clearCompactTimer() {
    if (compactTimerRef.current) {
      clearTimeout(compactTimerRef.current);
      compactTimerRef.current = null;
    }
  }

  useEffect(() => {
    // انتقال من أوفلاين → أونلاين
    if (!wasOnlineRef.current && isOnline) {
      clearHideTimer();
      clearCompactTimer();
      setOfflinePhase(null);
      setShowBackOnline(true);
      hideTimerRef.current = setTimeout(() => {
        setShowBackOnline(false);
        hideTimerRef.current = null;
      }, BACK_ONLINE_DURATION_MS);
    }

    // دخول أوفلاين (أو البقاء أوفلاين عند التركيب)
    if (!isOnline) {
      clearHideTimer();
      setShowBackOnline(false);
      // كل مرة نصير أوفلاين: ابدأ بالشريط الكامل ثم بعد 3ث الشارة الجانبية
      if (wasOnlineRef.current || offlinePhase === null) {
        setOfflinePhase('full');
        clearCompactTimer();
        compactTimerRef.current = setTimeout(() => {
          setOfflinePhase('compact');
          compactTimerRef.current = null;
        }, OFFLINE_FULL_DURATION_MS);
      }
    }

    wasOnlineRef.current = isOnline;
    return () => {
      clearHideTimer();
      clearCompactTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- offlinePhase فقط للتحقق عند التركيب
  }, [isOnline]);

  function dismissBackOnline() {
    clearHideTimer();
    setShowBackOnline(false);
  }

  const bottomBase =
    'bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))]';

  // شارة جانبية مدمجة أثناء الأوفلاين بعد 3 ثوانٍ
  if (!isOnline && offlinePhase === 'compact') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'fixed z-[100] flex items-center gap-1.5 rounded-full bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground shadow-lg sm:text-sm',
          'end-3 transition-all duration-300 ease-out',
          bottomBase,
        )}
      >
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        <span>غير متصل</span>
      </div>
    );
  }

  // شريط كامل: أوفلاين (أول 3 ث) أو عودة الاتصال
  const showFullOffline = !isOnline && offlinePhase === 'full';
  const visible = showFullOffline || showBackOnline;
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-0 z-[100] flex items-center justify-center gap-2 px-4 py-3 text-center text-sm font-medium shadow-lg sm:text-base',
        bottomBase,
        'mx-3 mb-1 max-w-lg rounded-xl transition-all duration-300 ease-out md:mx-auto',
        showFullOffline
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-emerald-600 text-white',
      )}
    >
      <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-2.5 pe-6">
        {showFullOffline ? (
          <WifiOff className="h-5 w-5 shrink-0" aria-hidden />
        ) : (
          <Wifi className="h-5 w-5 shrink-0" aria-hidden />
        )}
        <span className="leading-snug">
          {showFullOffline
            ? 'لا يوجد اتصال — قد تظهر آخر بيانات محفوظة (قد تكون قديمة)'
            : 'عاد الاتصال'}
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
