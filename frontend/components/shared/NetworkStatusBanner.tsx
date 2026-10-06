'use client';

/**
 * شريط حالة الشبكة — أسفل الشاشة.
 *
 * - أوفلاين: شريط كامل ثم شارة جانبية «غير متصل».
 * - عودة الاتصال: شريط أخضر مؤقت.
 * - اتصال بطيء — شارة صفراء خفيفة (لا تزعج مثل الأوفلاين).
 */

import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, SignalLow, X } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useConnectionQuality } from '@/hooks/useConnectionQuality';
import { connectionQualityLabel } from '@/lib/connectionQuality';
import { cn } from '@/lib/utils';

const BACK_ONLINE_DURATION_MS = 3500;
const OFFLINE_FULL_DURATION_MS = 3000;
const SLOW_HINT_DURATION_MS = 5000;

type OfflinePhase = 'full' | 'compact';

export function NetworkStatusBanner() {
  const isOnline = useOnlineStatus();
  const quality = useConnectionQuality();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [offlinePhase, setOfflinePhase] = useState<OfflinePhase | null>(null);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const wasOnlineRef = useRef(isOnline);
  const wasSlowRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function clearSlowTimer() {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  }

  useEffect(() => {
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

    if (!isOnline) {
      clearHideTimer();
      setShowBackOnline(false);
      setShowSlowHint(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Slow network soft hint (once when entering slow while online)
  useEffect(() => {
    if (!isOnline) {
      wasSlowRef.current = false;
      return;
    }
    const isSlow = quality === 'slow';
    if (isSlow && !wasSlowRef.current) {
      setShowSlowHint(true);
      clearSlowTimer();
      slowTimerRef.current = setTimeout(() => {
        setShowSlowHint(false);
        slowTimerRef.current = null;
      }, SLOW_HINT_DURATION_MS);
    }
    if (!isSlow) {
      setShowSlowHint(false);
    }
    wasSlowRef.current = isSlow;
    return () => clearSlowTimer();
  }, [quality, isOnline]);

  function dismissBackOnline() {
    clearHideTimer();
    setShowBackOnline(false);
  }

  function dismissSlow() {
    clearSlowTimer();
    setShowSlowHint(false);
  }

  // Compact offline chip (persistent until online)
  const showOfflineCompact = !isOnline && offlinePhase === 'compact';
  const showOfflineFull = !isOnline && offlinePhase === 'full';

  return (
    <>
      {/* Full offline bar */}
      {showOfflineFull && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-2 bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground pwa-safe-bottom"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          <span>لا يوجد اتصال بالإنترنت</span>
        </div>
      )}

      {/* Compact offline */}
      {showOfflineCompact && (
        <div
          role="status"
          className={cn(
            'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] start-3 z-[60] flex items-center gap-1.5 rounded-full',
            'bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-medium shadow-lg',
            'sm:bottom-6',
          )}
        >
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
          غير متصل
        </div>
      )}

      {/* Back online */}
      {showBackOnline && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-2 bg-success px-4 py-2.5 text-sm font-medium text-success-foreground pwa-safe-bottom"
        >
          <Wifi className="h-4 w-4 shrink-0" aria-hidden />
          <span>عاد الاتصال</span>
          <button
            type="button"
            onClick={dismissBackOnline}
            className="absolute end-3 rounded p-1 opacity-80 hover:opacity-100"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Slow connection hint */}
      {showSlowHint && isOnline && !showBackOnline && (
        <div
          role="status"
          className={cn(
            'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] start-3 z-[55] flex max-w-[min(100%,280px)] items-center gap-1.5 rounded-full',
            'bg-warning text-warning-foreground px-3 py-1.5 text-xs font-medium shadow-lg',
            'sm:bottom-6',
          )}
        >
          <SignalLow className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{connectionQualityLabel('slow')} — قد يستغرق التحميل وقتًا أطول</span>
          <button
            type="button"
            onClick={dismissSlow}
            className="ms-1 rounded p-0.5 opacity-80 hover:opacity-100"
            aria-label="إغلاق"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
