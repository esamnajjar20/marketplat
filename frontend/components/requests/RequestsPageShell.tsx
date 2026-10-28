'use client';

import dynamic from 'next/dynamic';
import { RequestListSkeleton } from './RequestListSkeleton';

/**
 * Client shell for /requests — mirrors AdsPageClient/SearchPageClient.
 *
 * HYDRATION-SAFE:
 *   RequestsPageClient uses useSearchParams(), so it must not render during
 *   SSR. Wrapping it in dynamic({ ssr: false }) inside this Client Component
 *   (not inside page.tsx) satisfies Next.js 15's rule that dynamic({ssr:false})
 *   is only valid in Client Components.
 */
const RequestsPageClient = dynamic(
  () =>
    import('@/components/requests/RequestsPageClient').then(
      (m) => m.RequestsPageClient,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="container mx-auto max-w-7xl space-y-4 px-3 py-6 sm:px-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
        <RequestListSkeleton />
      </div>
    ),
  },
);

export function RequestsPageShell() {
  return <RequestsPageClient />;
}
