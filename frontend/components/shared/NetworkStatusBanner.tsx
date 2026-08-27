'use client';

/**
 * Weak-net N1: banner when offline or on constrained connections (2g / saveData).
 */

import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

type BannerState = 'offline' | 'slow' | 'back' | null;

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

  useEffect(() => {
    let backTimer: ReturnType<typeof setTimeout> | null = null;

    const clearBack = () => {
      if (backTimer) {
        clearTimeout(backTimer);
        backTimer = null;
      }
    };

    const showOnlineRecovery = () => {
      clearBack();
      setState('back');
      backTimer = setTimeout(() => {
        setState(isSlowConnection() ? 'slow' : null);
      }, 2500);
    };

    const onOffline = () => {
      clearBack();
      setState('offline');
    };

    const onOnline = () => {
      showOnlineRecovery();
    };

    const onConnectionChange = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setState('offline');
        return;
      }
      setState((prev) => {
        if (prev === 'offline' || prev === 'back') return prev;
        return isSlowConnection() ? 'slow' : null;
      });
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setState('offline');
    } else if (isSlowConnection()) {
      setState('slow');
    }

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    conn?.addEventListener?.('change', onConnectionChange);

    return () => {
      clearBack();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      conn?.removeEventListener?.('change', onConnectionChange);
    };
  }, []);

  if (!state) return null;

  if (state === 'offline') {
    return (
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[100] bg-destructive px-3 py-2 text-center text-sm text-destructive-foreground shadow"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          لا يوجد اتصال بالإنترنت — سيتم استئناف التحديث عند عودة الشبكة
        </span>
      </div>
    );
  }

  if (state === 'slow') {
    return (
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[100] bg-amber-600 px-3 py-2 text-center text-sm text-white shadow dark:bg-amber-700"
      >
        اتصال بطيء أو توفير بيانات مفعّل — قد يتأخر تحميل الصور والقوائم
      </div>
    );
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] bg-emerald-600 px-3 py-2 text-center text-sm text-white shadow"
    >
      <span className="inline-flex items-center justify-center gap-2">
        <Wifi className="h-4 w-4 shrink-0" aria-hidden />
        عاد الاتصال
      </span>
    </div>
  );
}
