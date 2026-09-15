import { Skeleton } from '@/components/shared/ui/Skeleton';

export function ServiceListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card p-3 shadow-xs">
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="mb-2 h-4 w-4/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="mt-1 h-3 w-3/5" />
    </div>
  );
}
