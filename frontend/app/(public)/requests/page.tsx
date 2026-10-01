import { Suspense } from 'react';
import { RequestsPageClient } from '@/components/requests/RequestsPageClient';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';

/**
 * سوق الطلبات — الصفحة العامة للطلبات المفتوحة.
 * الـ metadata معرّفة في layout.tsx لنفس المسار.
 */
export default function OpenRequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-7xl space-y-4 px-3 py-6 sm:px-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded bg-muted" />
          <RequestListSkeleton />
        </div>
      }
    >
      <RequestsPageClient />
    </Suspense>
  );
}
