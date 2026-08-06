/**
 * Admin product-categories loading skeleton, mirroring
 * /admin/service-categories/loading.tsx exactly.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function AdminProductCategoriesLoading() {
  return (
    // AdminLayout's <main> already provides p-6; this must not
    // duplicate it, or the skeleton causes a layout shift when
    // replaced by the real page.tsx (which uses space-y-6 with no
    // extra p-6). Mirrors the same fix in service-categories/loading.tsx.
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
