'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { cn } from '@/lib/utils';

// HOME-FLICKER-01: only show the dim + progress bar when the refresh is slow.
// A fast key change right after hydration (saved city / identity) used to dim
// the whole page for a split second, which read as a flash.
const BUSY_DELAY_MS = 350;

/**
 * useHomepage keeps the previous city's sections on screen while a new city
 * loads (keepPreviousData). Without a signal the user reads stale results as
 * the new city's. This wrapper dims the page, shows a thin progress bar and
 * announces the refresh to screen readers if the new payload is slow to arrive.
 * It never blocks pointer events, so the city chips stay usable.
 */
export function HomeBusyBoundary({ children }: { children: ReactNode }) {
  const { isPlaceholderData } = useHomeFeed();
  const pending = Boolean(isPlaceholderData);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pending) {
      setBusy(false);
      return;
    }
    const id = setTimeout(() => setBusy(true), BUSY_DELAY_MS);
    return () => clearTimeout(id);
  }, [pending]);

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
