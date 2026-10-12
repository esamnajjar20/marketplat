'use client';

/**
 * شريط حالة الشبكة — أسفل الشاشة.
 *
 * - أوفلاين: شريط كامل ثم شارة جانبية «غير متصل».
 * - عودة الاتصال: شريط أخضر مؤقت.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Archive, FileText, Wifi, WifiOff, X } from 'lucide-react';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import { getLastOfflineQueryCacheSavedAt } from '@/lib/offlineQueryCache';
import { formatOfflineSavedAt } from '@/lib/offlineFreshness';

const BACK_ONLINE_DURATION_MS = 3500;
const OFFLINE_FULL_DURATION_MS = 3000;

type OfflinePhase = 'full' | 'compact';

export function NetworkStatusBanner() {
  const isOnline = useOnlineStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [offlinePhase, setOfflinePhase] = useState<OfflinePhase | null>(null);
  const [offlineQuerySavedAt, setOfflineQuerySavedAt] = useState<number | null>(null);
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

  useEffect(() => { setOfflineQuerySavedAt(getLastOfflineQueryCacheSavedAt()); }, [isOnline]);

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

  function dismissBackOnline() {
    clearHideTimer();
    setShowBackOnline(false);
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
          aria-atomic="true"
          className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-2 bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground pwa-safe-bottom"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          <span className="shrink-0">لا يوجد اتصال بالإنترنت</span>
          {offlineQuerySavedAt != null && <span className="hidden max-w-[30vw] truncate text-xs font-normal opacity-90 sm:inline">— بيانات محفوظة · {formatOfflineSavedAt(new Date(offlineQuerySavedAt).toISOString())}</span>}
          <nav aria-label="خيارات الأوفلاين" className="ms-2 flex shrink-0 items-center gap-2">
            <Link
              href="/offline?tab=saved"
              className="inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-1 text-xs underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden />
              المحفوظات
            </Link>
            <Link
              href="/offline?tab=drafts"
              className="hidden items-center gap-1 rounded-md border border-current/30 px-2 py-1 text-xs underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:inline-flex"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              المسودات
            </Link>
          </nav>
        </div>
      )}

      {/* Compact offline */}
      {showOfflineCompact && (
        <div
          role="status"
          aria-atomic="true"
          className={cn(
            'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] start-3 z-[60] flex items-center gap-1.5 rounded-full',
            'bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-medium shadow-lg',
            'sm:bottom-6',
          )}
        >
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
          <span>غير متصل</span>
          {offlineQuerySavedAt != null && <span className="max-w-[30vw] truncate font-normal opacity-90">· {formatOfflineSavedAt(new Date(offlineQuerySavedAt).toISOString())}</span>}
          <Link
            href="/offline?tab=saved"
            aria-label="فتح المحفوظات دون اتصال"
            className="ms-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-current/40 px-2 py-1 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Archive className="h-3 w-3" aria-hidden />
            <span>المحفوظات</span>
          </Link>
        </div>
      )}

      {/* Back online */}
      {showBackOnline && (
        <div
          role="status"
          aria-atomic="true"
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
    </>
  );
}
