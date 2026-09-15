import { Skeleton } from '@/components/shared/ui/Skeleton';

export function StoreCardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-3 shadow-xs">
      <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
      <div className="flex flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
