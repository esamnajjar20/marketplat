'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useScrollRestore } from '@/hooks/useScrollRestore';

function ScrollRestoreInner() {
  // FIX SCROLL-KEY-STALE-01: useSearchParams re-renders on query-only navigation,
  // so the storage key tracks ?page=N changes. It needs a Suspense boundary
  // (below); fallback={null} keeps the rest of the page unaffected.
  const searchParams = useSearchParams();
  const raw = searchParams?.toString() ?? '';
  useScrollRestore(true, raw ? `?${raw}` : '');
  return null;
}

/** Mount once under public/protected shell to keep list scroll positions. */
export function ScrollRestore() {
  return (
    <Suspense fallback={null}>
      <ScrollRestoreInner />
    </Suspense>
  );
}
