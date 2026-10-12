import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * mirrors AdListItem's responsive shape (24×24 mobile thumbnail, 36×28 desktop thumbnail, title,
 * price, meta row) — the counterpart to AdCardSkeleton for the list
 * view of SearchResults. Without this, switching to list view during
 * a refetch had nothing but AdCardSkeleton's grid-shaped skeleton to
 * fall back to, which doesn't read as "this is about to become a
 * list."
 */
export function AdListItemSkeleton() {
  return (
    <div className="flex min-w-0 gap-3 rounded-2xl border border-border/70 bg-card p-2.5 sm:gap-4 sm:p-3">
      <Skeleton className="h-24 w-24 shrink-0 rounded-xl sm:h-28 sm:w-36" />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
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
