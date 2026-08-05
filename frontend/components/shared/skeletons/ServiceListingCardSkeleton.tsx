import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * FIX UX-04: counterpart to AdCardSkeleton for ServiceListingCard —
 * same aspect-[4/3] image + p-3 text block shape as AdCardSkeleton,
 * but with a third meta line since ServiceListingCard shows a
 * provider name row that AdCard doesn't.
 */
export function ServiceListingCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
