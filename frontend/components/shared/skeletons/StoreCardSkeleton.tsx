import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * FIX UX-04: StoreCard is a horizontal round-avatar layout, not the
 * vertical image card AdCardSkeleton/ServiceListingCardSkeleton
 * assume — needs its own shape rather than reusing either.
 */
export function StoreCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border bg-card p-3">
      <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3.5 w-4/5" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}
