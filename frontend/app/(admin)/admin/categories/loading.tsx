/**
 * PERF-09: Admin categories loading skeleton.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function AdminCategoriesLoading() {
  return (
    // AUDIT-FIX (admin #2): AdminLayout's <main> already provides p-6;
    // this duplicated it, causing a layout shift when the skeleton is
    // replaced by the real page.tsx (which uses space-y-6 with no
    // extra p-6).
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
