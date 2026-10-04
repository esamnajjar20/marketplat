import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';

/**
 * هيكل بطاقة إعلان — يطابق AdCard الفعلية (نسبة الصورة، الحشوة، صفوف التفاصيل)
 * لتجنب قفزة التخطيط. `density="compact"` للشرائط الأفقية في الرئيسية.
 */
export function AdCardSkeleton({ density = 'default' }: { density?: 'default' | 'compact' }) {
  const compact = density === 'compact';
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
      <div className="relative">
        <Skeleton className={cn('w-full rounded-none', 'aspect-[4/3]')} />
        <Skeleton className="absolute end-2 top-2 h-9 w-9 rounded-full" />
      </div>
      <div className={cn('flex flex-1 flex-col', compact ? 'gap-1 p-2.5' : 'gap-1.5 p-3 sm:p-3.5')}>
        <Skeleton className={cn('w-2/5', compact ? 'h-5' : 'h-6')} />
        <Skeleton className="h-3.5 w-[88%]" />
        <Skeleton className="h-3.5 w-3/5" />
        <div className="mt-auto space-y-1.5 border-t border-border/40 pt-2">
          <Skeleton className="h-3 w-1/3" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-3 w-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
