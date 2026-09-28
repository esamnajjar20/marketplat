'use client';

import type { ReactNode } from 'react';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { cn } from '@/lib/utils';

/**
 * useHomepage keeps the previous city's sections on screen while a new city
 * loads (keepPreviousData). Without a signal the user reads stale results as
 * the new city's. This wrapper dims the page, shows a thin progress bar and
 * announces the refresh to screen readers until the new payload arrives.
 * It never blocks pointer events, so the city chips stay usable.
 */
export function HomeBusyBoundary({ children }: { children: ReactNode }) {
  const { isPlaceholderData } = useHomepage();
  const busy = Boolean(isPlaceholderData);

  return (
    <div aria-busy={busy}>
      <p role="status" className="sr-only">
        {busy ? 'جارٍ تحديث النتائج' : ''}
      </p>
      {busy ? (
        <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary" />
      ) : null}
      <div className={cn('transition-opacity duration-200', busy && 'opacity-60')}>{children}</div>
    </div>
  );
}
