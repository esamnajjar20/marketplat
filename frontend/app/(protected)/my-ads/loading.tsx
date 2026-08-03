/**
 * PERF-09: My Ads page loading skeleton.
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';

export default function MyAdsLoading() {
  return (
    // AUDIT-FIX (protected #8): matches my-ads/page.tsx's "space-y-4"
    // wrapper instead of duplicating ProtectedLayout's own p-6 padding
    // via an extra container.
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
