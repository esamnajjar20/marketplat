'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage';

const PREFIX = 'marketplat:scroll:';

/**
 * FIX SCROLL-INCLUDE-SEARCH: المفتاح يشمل search params — بدونه،
 * /ads?page=2 و/ads?page=3 يتشاركان نفس المفتاح، فيستعيد أحدهما موضع
 * الآخر (تجربة مشوشة عند التنقل بين صفحات القوائم).
 *
 * نقرأ window.location.search مباشرة (وليس useSearchParams) لأن الأخير
 * يتطلب Suspense boundary في Next.js 15+ — قد يكسر layout حيث يُستخدم
 * هذا الـ hook. window.location.search آمن داخل useEffect.
 */
function storageKey(path: string, search = ''): string {
  // استبعاد ?_rsc= (Next.js internals) — لا داعي له في المفتاح
  const cleaned = search
    .replace(/[?&]_rsc=[^&]*/g, '')
    .replace(/^&/, '?')
    .replace(/[?&]$/, '');
  return `${PREFIX}${path}${cleaned}`;
}

/**
 * PHASE-1 UX: remember window scrollY per path in sessionStorage and
 * restore after back/forward or soft navigation when the list remounts.
 *
 * Use once in public/protected layouts or on main browse pages.
 */
export function useScrollRestore(enabled = true, searchParam?: string) {
  const pathname = usePathname();
  // FIX SCROLL-KEY-STALE-01: the key used to be derived only when `pathname`
  // changed, so /ads?page=2 -> ?page=3 kept writing the position under the old
  // key. Callers that can observe search-param changes (see ScrollRestore) pass
  // them here so both effects re-run and the key follows the full URL.
  const search = searchParam ?? '';

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const currentSearch = searchParam !== undefined ? search : (window.location.search || '');
    const key = storageKey(pathname, currentSearch);
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let safetyTimer: number | undefined;
    let frameOne = 0;
    let frameTwo = 0;

    const stopRestoration = () => {
      cancelled = true;
      observer?.disconnect();
      if (safetyTimer !== undefined) window.clearTimeout(safetyTimer);
      window.removeEventListener('wheel', stopRestoration, true);
      window.removeEventListener('touchstart', stopRestoration, true);
      window.removeEventListener('pointerdown', stopRestoration, true);
      window.removeEventListener('keydown', stopRestoration, true);
    };

    const scrollWithoutAnimation = (top: number) => {
      const root = document.documentElement;
      const previous = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo({ top, behavior: 'auto' });
      root.style.scrollBehavior = previous;
    };

    try {
      const raw = safeStorageGet(key, 'session');
      const y = raw ? Number(raw) : 0;
      if (Number.isFinite(y) && y > 0) {
        // A restore is a one-time navigation aid, not an ongoing controller
        // of the user's scroll position. User interaction cancels all retries.
        window.addEventListener('wheel', stopRestoration, { capture: true, passive: true });
        window.addEventListener('touchstart', stopRestoration, { capture: true, passive: true });
        window.addEventListener('pointerdown', stopRestoration, true);
        window.addEventListener('keydown', stopRestoration, true);

        const restoreIfReady = () => {
          if (cancelled) return;
          scrollWithoutAnimation(y);
          if (window.scrollY >= y - 2) {
            observer?.disconnect();
            if (safetyTimer !== undefined) window.clearTimeout(safetyTimer);
          }
        };

        frameOne = window.requestAnimationFrame(() => {
          frameTwo = window.requestAnimationFrame(restoreIfReady);
        });

        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            if (cancelled) return;
            if (document.documentElement.scrollHeight >= y + window.innerHeight) {
              restoreIfReady();
            }
          });
          observer.observe(document.documentElement);
          safetyTimer = window.setTimeout(() => observer?.disconnect(), 2500);
        }
      }
    } catch {
      /* private mode */
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      observer?.disconnect();
      if (safetyTimer !== undefined) window.clearTimeout(safetyTimer);
      window.removeEventListener('wheel', stopRestoration, true);
      window.removeEventListener('touchstart', stopRestoration, true);
      window.removeEventListener('pointerdown', stopRestoration, true);
      window.removeEventListener('keydown', stopRestoration, true);
    };
  }, [pathname, search, enabled, searchParam]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const currentSearch = searchParam !== undefined ? search : (window.location.search || '');
    const key = storageKey(pathname, currentSearch);

    let ticking = false;
    function persist() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        try {
          safeStorageSet(key, String(Math.round(window.scrollY)), 'session');
        } catch {
          /* ignore */
        }
      });
    }

    window.addEventListener('scroll', persist, { passive: true });
    return () => {
      window.removeEventListener('scroll', persist);
      try {
        safeStorageSet(key, String(Math.round(window.scrollY)), 'session');
      } catch {
        /* ignore */
      }
    };
  }, [pathname, search, enabled, searchParam]);
}
