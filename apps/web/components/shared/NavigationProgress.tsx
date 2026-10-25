'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LOADING_COPY } from '@/lib/loadingCopy';

const START_EVENT = 'marketplace:nav-start';
const SHOW_DELAY_MS = 120;
const FAILSAFE_MS = 12_000;

/** Global route feedback plus a visible recovery action for stalled App Router transitions. */
export function NavigationProgress() {
  // FIX NAV-QUERY-ONLY-01: useSearchParams needs a Suspense boundary; fallback={null}
  // keeps the rest of the root layout unaffected.
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  // Location identity = pathname + query (hash never counts).
  const locationKey = search ? `${pathname}?${search}` : pathname;
  const [visible, setVisible] = useState(false);
  const [stalledHref, setStalledHref] = useState<string | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedPath = useRef<string | null>(null);
  const startedHref = useRef<string | null>(null);
  const lastPathname = useRef(pathname);
  const lastLocationKey = useRef(locationKey);
  // 'path' navigations get the stall-recovery banner; query-only ones only the bar.
  const startedKind = useRef<'path' | 'query'>('path');

  useEffect(() => {
    const clearTimers = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      showTimer.current = null;
      hideTimer.current = null;
    };

    const start = (href: string, sourcePath = window.location.pathname) => {
      if (!href || href.startsWith('#')) return;
      let target: URL;
      try { target = new URL(href, window.location.href); } catch { return; }
      if (target.origin !== window.location.origin) return;
      // FIX NAV-SLASH-STALL-01: '/ads/' vs '/ads' is the same destination; treating it as a
      // path change never "lands" (pathname is identical) and raised a false stall alert at 12s.
      const normalizePath = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
      const samePath = normalizePath(target.pathname) === normalizePath(window.location.pathname);
      // Hash-only or identical URL: nothing to load.
      if (samePath && target.search === window.location.search) return;
      if (startedHref.current === target.href) return;

      clearTimers();
      setStalledHref(null);
      const kind: 'path' | 'query' = samePath ? 'query' : 'path';
      startedKind.current = kind;
      startedPath.current = samePath ? lastLocationKey.current : sourcePath;
      startedHref.current = target.href;
      showTimer.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      hideTimer.current = setTimeout(() => {
        if (showTimer.current) clearTimeout(showTimer.current);
        showTimer.current = null;
        hideTimer.current = null;
        setVisible(false);
        if (kind === 'query') {
          // Query-only: the URL may legitimately never change (handler-driven tabs/filters);
          // drop the bar silently instead of showing a false "navigation stalled" alert.
          startedPath.current = null;
          startedHref.current = null;
          return;
        }
        // Keep a recovery surface instead of silently dropping progress on a stalled route.
        setStalledHref(target.href);
      }, FAILSAFE_MS);
    };

    const onClick = (event: MouseEvent) => {
      // FIX NAV-FALSE-STALL-01: this listener is registered in the BUBBLE phase (see
      // addEventListener below) and no longer checks event.defaultPrevented.
      //  - Capture phase ran before any app handler, so a button nested in a link card
      //    (AdCard heart, NotificationRow mark-read / delete) that calls
      //    preventDefault + stopPropagation still started a phantom navigation: progress
      //    bar after 120ms and the "navigation stalled" banner after 12s. React's
      //    stopPropagation also stops the native event, so a bubble listener never sees it.
      //  - defaultPrevented can't be used as a signal: next/link always calls
      //    preventDefault for client-side navigation (see NavigationProgress.test).
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const node = event.target;
      if (!(node instanceof Element)) return;
      const anchor = node.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      // A click on an interactive control nested inside the link is that control's
      // action, not link navigation (covers handlers that don't stopPropagation).
      const control = node.closest('button, [role="button"], input, select, textarea, label');
      if (control && control !== anchor && anchor.contains(control)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download') || anchor.getAttribute('aria-disabled') === 'true') return;
      start(anchor.href);
    };

    const onPopState = () => {
      const previousPath = lastPathname.current;
      if (previousPath !== window.location.pathname) start(previousPath, previousPath);
    };
    // (query-only back/forward is not signalled: the history entry is already cached by Next.)
    const onProgrammaticStart = (event: Event) => {
      const detail = (event as CustomEvent<{ href?: string }>).detail;
      if (detail?.href) start(detail.href);
    };

    document.addEventListener('click', onClick);
    window.addEventListener(START_EVENT, onProgrammaticStart);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener(START_EVENT, onProgrammaticStart);
      window.removeEventListener('popstate', onPopState);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    lastPathname.current = pathname;
    lastLocationKey.current = locationKey;
    // startedPath holds the SOURCE location (path, or path+query for query-only starts);
    // any change of the committed location means the navigation landed.
    const landed = startedKind.current === 'query'
      ? locationKey !== startedPath.current
      : pathname !== startedPath.current;
    if (startedPath.current !== null && landed) {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      showTimer.current = null;
      hideTimer.current = null;
      startedPath.current = null;
      startedHref.current = null;
      setVisible(false);
      setStalledHref(null);
    }
  }, [pathname, locationKey]);

  if (stalledHref) {
    return (
      <div className="fixed inset-x-3 top-3 z-[10000] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border bg-background p-3 text-foreground shadow-lg" role="alert" aria-live="assertive">
        <p className="text-sm">{LOADING_COPY.navigationStalled}</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => window.location.assign(stalledHref)}>إعادة المحاولة</button>
          <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => { setStalledHref(null); startedPath.current = null; startedHref.current = null; }}>إغلاق</button>
        </div>
      </div>
    );
  }
  if (!visible) return null;
  return <div className="nav-progress-track" role="progressbar" aria-label={LOADING_COPY.navigating} aria-valuetext={LOADING_COPY.page}><div className="nav-progress-bar" /></div>;
}

/** Call before router.push/replace when navigation is initiated programmatically. */
export function signalNavigationStart(href: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail: { href } }));
}
