'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LOADING_COPY } from '@/lib/loadingCopy';

const START_EVENT = 'marketplace:nav-start';
const SHOW_DELAY_MS = 120;
const FAILSAFE_MS = 12_000;

/** Global route feedback plus a visible recovery action for stalled App Router transitions. */
export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [stalledHref, setStalledHref] = useState<string | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedPath = useRef<string | null>(null);
  const startedHref = useRef<string | null>(null);
  const lastPathname = useRef(pathname);

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
      if (target.origin !== window.location.origin || target.pathname === window.location.pathname) return;
      if (startedHref.current === target.href) return;

      clearTimers();
      setStalledHref(null);
      startedPath.current = sourcePath;
      startedHref.current = target.href;
      showTimer.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      hideTimer.current = setTimeout(() => {
        // Keep a recovery surface instead of silently dropping progress on a stalled route.
        if (showTimer.current) clearTimeout(showTimer.current);
        showTimer.current = null;
        hideTimer.current = null;
        setVisible(false);
        setStalledHref(target.href);
      }, FAILSAFE_MS);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const node = event.target;
      if (!(node instanceof Element)) return;
      const anchor = node.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download') || anchor.getAttribute('aria-disabled') === 'true') return;
      start(anchor.href);
    };

    const onPopState = () => {
      const previousPath = lastPathname.current;
      if (previousPath !== window.location.pathname) start(previousPath, previousPath);
    };
    const onProgrammaticStart = (event: Event) => {
      const detail = (event as CustomEvent<{ href?: string }>).detail;
      if (detail?.href) start(detail.href);
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener(START_EVENT, onProgrammaticStart);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(START_EVENT, onProgrammaticStart);
      window.removeEventListener('popstate', onPopState);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    lastPathname.current = pathname;
    if (startedPath.current !== null && pathname !== startedPath.current) {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      showTimer.current = null;
      hideTimer.current = null;
      startedPath.current = null;
      startedHref.current = null;
      setVisible(false);
      setStalledHref(null);
    }
  }, [pathname]);

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
