/**
 * AdDetailsSkeleton — full-page skeleton for the ad detail view.
 * Replaces the placeholder in components/ads/AdDetailSkeleton.tsx.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export function AdDetailsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Main content column */}
      <div aria-hidden="true" className="space-y-6 lg:col-span-2">
        {/* Image gallery */}
        <Skeleton className="aspect-video w-full rounded-xl" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-16 rounded-md" />
          ))}
        </div>
        {/* Title + price */}
        <div aria-hidden="true" className="space-y-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-7 w-32" />
        </div>
        {/* Metadata row: city, condition, date */}
        <div className="flex gap-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-28" />
        </div>
        {/* Description */}
        <div aria-hidden="true" className="space-y-2 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>

      {/* Sidebar: seller card */}
      <aside className="space-y-4">
        <div aria-hidden="true" className="rounded-xl border p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div aria-hidden="true" className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </aside>
    </div>
  );
}
