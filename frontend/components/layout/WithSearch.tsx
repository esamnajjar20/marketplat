'use client';

/**
 * WithSearch — hands the current `?query` string to a render function.
 *
 * MY-STORE-HUB-01: the /my-store hub's tab lives in the query, so the nav
 * groups need it to highlight the right child. useSearchParams() in a layout
 * component needs a Suspense boundary (static prerender bails out to the
 * client up to the nearest boundary) — callers MUST wrap this in <Suspense>
 * with a fallback that renders the same UI without the search.
 */
import { useSearchParams } from 'next/navigation';

export function WithSearch({ children }: { children: (search: string) => React.ReactNode }) {
  const sp = useSearchParams();
  const qs = sp.toString();
  return <>{children(qs ? `?${qs}` : '')}</>;
}
