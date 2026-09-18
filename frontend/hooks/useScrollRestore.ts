'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

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
export function useScrollRestore(enabled = true) {
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const search = window.location.search || '';
    const key = storageKey(pathname, search);
    let cleanupTimeout: (() => void) | undefined;
    let cleanupObserver: (() => void) | undefined;

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
          cleanupTimeout = () => clearTimeout(t);

          // FIX SCROLL-RESIZE: ResizeObserver يستعيد الموضع مرة أخرى عند
          // استقرار الـ layout (صور/بطاقات تُحمَّل بعد 120ms على الشبكات
          // البطيئة). يوقف نفسه بعد أول محاولة ناجحة.
          if (typeof ResizeObserver !== 'undefined') {
            let done = false;
            const observer = new ResizeObserver(() => {
              if (done) return;
              const needed = y + window.innerHeight;
              if (document.body.scrollHeight >= needed) {
                window.scrollTo(0, y);
                done = true;
                observer.disconnect();
              }
            });
            observer.observe(document.body);
            // Safety: disconnect بعد 3 ثوانٍ حتى لا يبقى observer عالقاً
            const safety = window.setTimeout(() => observer.disconnect(), 3000);
            cleanupObserver = () => {
              observer.disconnect();
              clearTimeout(safety);
            };
          }
        }
      }
    } catch {
      /* private mode */
    }

    return () => {
      cleanupTimeout?.();
      cleanupObserver?.();
    };
  }, [pathname, enabled]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const search = window.location.search || '';
    const key = storageKey(pathname, search);

    let ticking = false;
    function persist() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        try {
          sessionStorage.setItem(key, String(Math.round(window.scrollY)));
        } catch {
          /* ignore */
        }
      });
    }

    window.addEventListener('scroll', persist, { passive: true });
    return () => {
      window.removeEventListener('scroll', persist);
      try {
        sessionStorage.setItem(key, String(Math.round(window.scrollY)));
      } catch {
        /* ignore */
      }
    };
  }, [pathname, enabled]);
}
