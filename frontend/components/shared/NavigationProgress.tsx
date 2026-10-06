'use client';
import '@/app/navigation-progress.css';

/**
 * NavigationProgress — مؤشر تحميل عام على مستوى المشروع.
 *
 * عند الضغط على رابط داخلي يظهر فوراً شريط تقدّم أعلى الشاشة،
 * وبعد ~280ms طبقة خفيفة بنص «جارٍ التحميل…» إن كان التنقّل بطيئاً.
 * يختفي عند وصول الصفحة الجديدة (تغيّر pathname/search).
 */

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

// overlay only on truly slow navigations.
// 280ms fired on every tap on 3G — the thin bar already covers
// fast cases; overlay should feel like a fallback, not the default.
const OVERLAY_DELAY_MS = 2000;
const COMPLETE_MS = 240;
const SAFETY_TIMEOUT_MS = 12_000;

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams?.toString() ?? ''}`;

  const [active, setActive] = useState(false);
  const [visibleOverlay, setVisibleOverlay] = useState(false);
  const [completing, setCompleting] = useState(false);

  const activeRef = useRef(false);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    if (completeTimer.current) clearTimeout(completeTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    overlayTimer.current = null;
    completeTimer.current = null;
    safetyTimer.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    setCompleting(true);
    setVisibleOverlay(false);
    clearTimers();
    completeTimer.current = setTimeout(() => {
      activeRef.current = false;
      setActive(false);
      setCompleting(false);
    }, COMPLETE_MS);
  }, [clearTimers]);

  const start = useCallback(
    (nextHref: string) => {
      if (typeof window !== 'undefined') {
        try {
          const url = new URL(nextHref, window.location.href);
          if (url.origin !== window.location.origin) return;
          const nextPath = url.pathname + url.search;
          const curPath = window.location.pathname + window.location.search;
          if (nextPath === curPath) return;
        } catch {
          return;
        }
      }

      clearTimers();
      activeRef.current = true;
      setCompleting(false);
      setActive(true);
      setVisibleOverlay(false);

      overlayTimer.current = setTimeout(() => {
        if (activeRef.current) setVisibleOverlay(true);
      }, OVERLAY_DELAY_MS);

      safetyTimer.current = setTimeout(() => {
        if (activeRef.current) finish();
      }, SAFETY_TIMEOUT_MS);
    },
    [clearTimers, finish],
  );

  useEffect(() => {
    if (activeRef.current) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  useEffect(() => {
    function onClickCapture(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as Element | null;
      if (!target) return;

      const anchor = target.closest('a');
      if (!anchor) return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.getAttribute('target') === '_blank') return;
      if (anchor.getAttribute('data-no-progress') != null) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

      start(href);
    }

    function onPushStart(e: Event) {
      const ce = e as CustomEvent<{ href?: string }>;
      if (ce.detail?.href) start(ce.detail.href);
    }

    document.addEventListener('click', onClickCapture, true);
    window.addEventListener('marketplace:nav-start', onPushStart as EventListener);
    return () => {
      document.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('marketplace:nav-start', onPushStart as EventListener);
      clearTimers();
    };
  }, [start, clearTimers]);

  if (!active && !completing) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[200]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="جارٍ تحميل الصفحة"
        aria-busy={active && !completing}
      >
        <div className="relative h-1 w-full overflow-hidden bg-primary/15">
          <div
            className={cn(
              'absolute inset-y-0 start-0 h-full rounded-full bg-primary',
              'shadow-[0_0_12px_hsl(var(--primary)/0.5)]',
              completing
                ? 'w-full transition-[width] duration-200 ease-out'
                : 'nav-progress-bar',
            )}
          />
        </div>
      </div>

      {visibleOverlay && !completing && (
        <div
          className="fixed inset-0 z-[199] flex items-start justify-center bg-background/45 pt-[18vh] backdrop-blur-[1px]"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card px-5 py-3.5 shadow-lg">
            <div
              className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
              aria-hidden
            />
            <div className="text-start">
              <p className="text-sm font-semibold text-foreground">جارٍ التحميل…</p>
              <p className="text-xs text-muted-foreground">يتم فتح الصفحة</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Suspense boundary مطلوب لأن useSearchParams في Client Component */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}

/** قبل router.push من كود لا يستخدم <Link> */
export function signalNavigationStart(href: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('marketplace:nav-start', { detail: { href } }),
  );
}
