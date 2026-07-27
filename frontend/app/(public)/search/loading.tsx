/**
 * PERF-09: Search page loading skeleton.
 * Shown during server-side searchParams resolution and prefetch.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function SearchLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <Skeleton className="mb-6 h-10 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </aside>
        <main className="lg:col-span-3">
          <Skeleton className="h-96 w-full rounded-lg" />
        </main>
      </div>
    </div>
  );
}
