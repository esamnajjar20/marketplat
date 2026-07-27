/**
 * PERF-09: Admin categories loading skeleton.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function AdminCategoriesLoading() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
