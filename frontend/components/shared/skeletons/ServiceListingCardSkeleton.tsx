import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';
import { CARD_SKELETON_SHELL, CARD_SKELETON_MEDIA, CARD_SKELETON_BODY, CARD_SKELETON_BODY_COMPACT } from '@/components/shared/cards/cardTokens';

/**
 * هيكل بطاقة خدمة. كان يرسم ترويسة بأفاتار (شكل مختلف تمامًا عن البطاقة
 * الفعلية)؛ الآن يطابق ServiceListingCard: صورة ثم سعر وعنوان وتذييل.
 */
export function ServiceListingCardSkeleton({
  density = 'default',
}: {
  density?: 'default' | 'compact';
}) {
  const compact = density === 'compact';
  return (
    <div aria-hidden="true" className={CARD_SKELETON_SHELL}>
      <div className="relative">
        <Skeleton className={CARD_SKELETON_MEDIA} />
        <Skeleton className="absolute end-2 top-2 h-9 w-9 rounded-full" />
      </div>
      <div className={compact ? CARD_SKELETON_BODY_COMPACT : CARD_SKELETON_BODY}>
        <Skeleton className={cn('w-2/5', compact ? 'h-5' : 'h-6')} />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-3/5" />
        <div className="mt-auto space-y-1.5 border-t border-border/40 pt-2">
          <Skeleton className="h-3 w-1/2" />
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
