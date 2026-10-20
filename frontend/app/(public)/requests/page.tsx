import dynamic from 'next/dynamic';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';

/**
 * سوق الطلبات — الصفحة العامة للطلبات المفتوحة.
 * الـ metadata معرّفة في layout.tsx لنفس المسار.
 *
 * HYDRATION-SAFE (v86):
 *   Previously this page wrapped <RequestsPageClient /> in an explicit
 *   <Suspense> because RequestsPageClient uses useSearchParams(), and
 *   Next.js requires a Suspense boundary around any client component
 *   that reads search params during SSR. That explicit <Suspense> emitted
 *   a root-level `div#S:0` wrapper in the server HTML, which React could
 *   not reconcile during hydration (streamed fallback → real content),
 *   causing the whole main#main-content tree to be torn down (React #418).
 *
 *   Fix: use dynamic({ ssr: false }) instead. The client component is
 *   rendered only on the client, so useSearchParams() is never called
 *   during SSR, no Suspense boundary is needed, and no `#S:0` appears in
 *   the server HTML. Same pattern already used by /ads, /products,
 *   /services, /stores, /search, /sellers/ranking.
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

export default function OpenRequestsPage() {
  return <RequestsPageClient />;
}
