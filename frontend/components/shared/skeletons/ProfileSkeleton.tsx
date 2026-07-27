/**
 * ProfileSkeleton — used while loading public profile pages and
 * the authenticated dashboard header.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export function ProfileSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      {/* Avatar + name header */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div aria-hidden="true" className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-1.5">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      {/* Bio */}
      <div aria-hidden="true" className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

/** Compact header skeleton used in the protected dashboard. */
export function DashboardHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div aria-hidden="true" className="space-y-1">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}
