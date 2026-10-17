'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const START_EVENT = 'marketplace:nav-start';
const SHOW_DELAY_MS = 120;
const FAILSAFE_MS = 12_000;

/**
 * Lightweight App Router navigation feedback. It watches same-origin anchor
 * clicks and the existing signalNavigationStart event, then clears when the
 * pathname changes. Route-level loading.tsx boundaries remain responsible for
 * their own page skeletons; this thin bar only signals that navigation began.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
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

    const finish = () => {
      clearTimers();
      startedPath.current = null;
      startedHref.current = null;
      setVisible(false);
    };

    const start = (href: string, sourcePath = window.location.pathname) => {
      if (!href || href.startsWith('#')) return;
      let target: URL;
      try {
        target = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (target.origin !== window.location.origin) return;
      // This component is for page-to-page navigation, not in-page state.
      // Query-only filters and hash tabs may not change pathname, so starting
      // the bar for them could leave it visible until the failsafe timer fires.
      if (target.pathname === window.location.pathname) return;

      // Repeated clicks on the same destination must not keep resetting the
      // failsafe timer; otherwise a stalled route could leave the bar alive
      // indefinitely under rapid repeated clicks.
      if (startedHref.current === target.href) return;
      clearTimers();
      startedPath.current = sourcePath;
      startedHref.current = target.href;
      showTimer.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      hideTimer.current = setTimeout(finish, FAILSAFE_MS);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download') || anchor.getAttribute('aria-disabled') === 'true') return;
      // Next.js <Link> calls preventDefault() intentionally to perform a
      // client-side route transition. Therefore defaultPrevented after event
      // dispatch cannot distinguish a real App Router navigation from a
      // cancelled click. Start for eligible same-origin page links here;
      // pathname changes clear the indicator and the failsafe bounds stalls.
      start(anchor.href);
    };

    const onPopState = () => {
      // The browser updates location before React's pathname hook rerenders.
      // Use the last committed path as the navigation source so Back/Forward
      // transitions get feedback and are cleared by the pathname effect.
      const previousPath = lastPathname.current;
      if (previousPath !== window.location.pathname) {
        start(previousPath, previousPath);
      }
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
    }
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className="nav-progress-track" role="progressbar" aria-label="جارٍ الانتقال بين الصفحات" aria-valuetext="جارٍ تحميل الصفحة">
      <div className="nav-progress-bar" />
    </div>
  );
}

/** Call before router.push/replace when navigation is initiated programmatically. */
export function signalNavigationStart(href: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail: { href } }));
}
