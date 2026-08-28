'use client';

/**
 * شريط حالة الشبكة — أعلى الصفحة، مؤقت، وقابل للإغلاق.
 */

import { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi, X } from 'lucide-react';

type BannerState = 'offline' | 'slow' | 'back' | null;

/** مدة الظهور بالميلي ثانية */
const DURATION_MS: Record<Exclude<BannerState, null>, number> = {
  offline: 8000,
  slow: 6000,
  back: 3500,
};

function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  const t = conn.effectiveType;
  return t === 'slow-2g' || t === '2g';
}

export function NetworkStatusBanner() {
  const [state, setState] = useState<BannerState>(null);
  /** المستخدم أغلق الشريط — لا نعيده إلا عند تغيّر حالة الشبكة */
  const dismissedRef = useRef<BannerState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function show(next: BannerState) {
    if (!next) {
      clearHideTimer();
      setState(null);
      return;
    }
    // إذا أغلق المستخدم نفس الحالة، لا نعيدها حتى تتغير الشبكة
    if (dismissedRef.current === next) return;

    clearHideTimer();
    setState(next);
    hideTimerRef.current = setTimeout(() => {
      setState(null);
      hideTimerRef.current = null;
    }, DURATION_MS[next]);
  }

  function dismiss() {
    dismissedRef.current = state;
    clearHideTimer();
    setState(null);
  }

  useEffect(() => {
    const onOffline = () => {
      dismissedRef.current = null;
      show('offline');
    };

    const onOnline = () => {
      dismissedRef.current = null;
      show('back');
    };

    const onConnectionChange = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        dismissedRef.current = null;
        show('offline');
        return;
      }
      if (isSlowConnection()) {
        // لا تقاطع رسالة "عاد الاتصال"
        setState((prev) => {
          if (prev === 'back') return prev;
          if (dismissedRef.current === 'slow') return prev;
          dismissedRef.current = null;
          clearHideTimer();
          hideTimerRef.current = setTimeout(() => {
            setState(null);
            hideTimerRef.current = null;
          }, DURATION_MS.slow);
          return 'slow';
        });
      }
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      show('offline');
    } else if (isSlowConnection()) {
      show('slow');
    }

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    conn?.addEventListener?.('change', onConnectionChange);

    return () => {
      clearHideTimer();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      conn?.removeEventListener?.('change', onConnectionChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) return null;

  const barBase =
    'fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-3 py-2.5 text-center text-sm shadow-md pt-[max(0.5rem,env(safe-area-inset-top))]';

  const styles: Record<Exclude<BannerState, null>, string> = {
    offline: 'bg-destructive text-destructive-foreground',
    slow: 'bg-amber-600 text-white dark:bg-amber-700',
    back: 'bg-emerald-600 text-white',
  };

  const messages: Record<Exclude<BannerState, null>, { icon: typeof Wifi; text: string }> = {
    offline: {
      icon: WifiOff,
      text: 'لا يوجد اتصال بالإنترنت — سيتم استئناف التحديث عند عودة الشبكة',
    },
    slow: {
      icon: Wifi,
      text: 'اتصال بطيء أو توفير بيانات مفعّل — قد يتأخر تحميل الصور والقوائم',
    },
    back: {
      icon: Wifi,
      text: 'عاد الاتصال',
    },
  };

  const { icon: Icon, text } = messages[state];

  return (
    <div role="status" className={`${barBase} ${styles[state]}`}>
      <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 pe-8">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="leading-snug">{text}</span>
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
