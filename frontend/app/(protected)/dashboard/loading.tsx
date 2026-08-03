/**
 * PERF-09: Dashboard loading skeleton.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function DashboardLoading() {
  return (
    // AUDIT-FIX (protected #8): container mx-auto px-4 py-6 duplicated
    // the padding ProtectedLayout's <main className="p-6"> already
    // provides, causing a layout shift when the skeleton is replaced by
    // the real page.tsx (which uses space-y-6 with no extra container).
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
