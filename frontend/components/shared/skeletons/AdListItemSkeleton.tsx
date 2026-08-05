import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * FIX UX-04: mirrors AdListItem's exact shape (28×20 thumbnail, title,
 * price, meta row) — the counterpart to AdCardSkeleton for the list
 * view of SearchResults. Without this, switching to list view during
 * a refetch had nothing but AdCardSkeleton's grid-shaped skeleton to
 * fall back to, which doesn't read as "this is about to become a
 * list."
 */
export function AdListItemSkeleton() {
  return (
    <div className="flex gap-3 p-3 rounded-lg border bg-card">
      <Skeleton className="w-28 h-20 shrink-0 rounded" />
      <div className="flex-1 min-w-0 space-y-2 py-0.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}
