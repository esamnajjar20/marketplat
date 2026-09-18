'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PREFIX = 'marketplat:scroll:';

function storageKey(path: string) {
  return `${PREFIX}${path}`;
}

/**
 * PHASE-1 UX: remember window scrollY per path in sessionStorage and
 * restore after back/forward or soft navigation when the list remounts.
 *
 * Use once in public/protected layouts or on main browse pages.
 */
export function useScrollRestore(enabled = true) {
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const key = storageKey(pathname);
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const y = Number(raw);
        if (Number.isFinite(y) && y > 0) {
          // After paint / images may shift layout — double rAF + short delay
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo(0, y);
            });
          });
          const t = window.setTimeout(() => {
            window.scrollTo({ top: y, behavior: 'auto' });
          }, 120);
          return () => clearTimeout(t);
        }
      }
    } catch {
      /* private mode */
    }
  }, [pathname, enabled]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let ticking = false;
    function persist() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        try {
          sessionStorage.setItem(storageKey(pathname), String(Math.round(window.scrollY)));
        } catch {
          /* ignore */
        }
      });
    }

    window.addEventListener('scroll', persist, { passive: true });
    return () => {
      window.removeEventListener('scroll', persist);
      try {
        sessionStorage.setItem(storageKey(pathname), String(Math.round(window.scrollY)));
      } catch {
        /* ignore */
      }
    };
  }, [pathname, enabled]);
}
