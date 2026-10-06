import { Skeleton } from '@/components/shared/ui/Skeleton';

export function StoreCardSkeleton() {
  return (
    <div className="flex h-full gap-3.5 overflow-hidden rounded-2xl border border-border/70 bg-card p-3.5 pe-11 shadow-xs">
      <Skeleton className="h-[4.25rem] w-[4.25rem] shrink-0 rounded-full sm:h-[4.5rem] sm:w-[4.5rem]" />
      <div className="flex flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
