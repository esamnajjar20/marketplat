import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * هيكل بطاقة إعلان — أقرب للشكل النهائي لتجنب قفزة التخطيط.
 */
export function AdCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
      <div className="relative">
        <Skeleton className="aspect-[4/3] w-full rounded-none" />
        <Skeleton className="absolute end-2 top-2 h-7 w-7 rounded-full" />
      </div>
      <div className="space-y-2.5 p-3">
        <Skeleton className="h-3.5 w-[88%]" />
        <Skeleton className="h-4 w-2/5" />
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-8" />
        </div>
      </div>
    </div>
  );
}
