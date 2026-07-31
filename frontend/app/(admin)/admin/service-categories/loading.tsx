/**
 * Epic 1.2: Admin service-categories loading skeleton, mirroring
 * /admin/categories/loading.tsx exactly.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function AdminServiceCategoriesLoading() {
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
