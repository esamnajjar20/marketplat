/**
 * PERF-09: Dashboard loading skeleton.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
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
