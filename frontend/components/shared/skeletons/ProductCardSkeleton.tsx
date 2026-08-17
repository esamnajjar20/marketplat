import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * Same shape family as AdCardSkeleton (vertical image card) but
 * matches ProductCard.tsx's actual aspect-square image (not
 * AdCardSkeleton's aspect-[4/3]) and its price-only meta row.
 */
export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Skeleton className="aspect-square w-full" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  );
}
