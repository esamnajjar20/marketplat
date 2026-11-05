'use client';

import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/shared/feedback/ErrorBoundary';

/**
 * Keep failures in scroll-loaded homepage sections local to that section.
 *
 * The homepage loads its lower rails with next/dynamic when LazySection enters
 * the viewport. A failed JS chunk must not bubble to the route-level boundary,
 * whose legacy recovery path hard-reloads the whole document. The user can
 * choose a reload from this fallback after seeing which section failed.
 */
export function HomeSectionBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <section
          role="alert"
          aria-live="assertive"
          className="container mx-auto max-w-7xl px-3 py-5 sm:px-4"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.04] px-4 py-5 text-center">
            <p className="text-sm font-semibold text-foreground">تعذّر تحميل هذا القسم</p>
            <p className="max-w-md text-xs leading-6 text-muted-foreground">
              لم تتوقف بقية الصفحة. قد يكون ملف القسم لم يصل بسبب اتصال متقطع أو تحديث حديث للموقع.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-10 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </section>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
