import { Skeleton } from '@/components/shared/ui/Skeleton';
import { CARD_SHELL_SOFT } from '@/components/shared/cards/cardTokens';

export function StoreCardSkeleton() {
  return (
    <div aria-hidden="true" className={`${CARD_SHELL_SOFT} flex min-w-0 gap-2.5 pt-3 pb-3.5 ps-3.5 pe-11 sm:gap-3.5 sm:pt-3.5 sm:pb-4 sm:ps-4 sm:pe-12`}>
      <Skeleton className="h-14 w-14 shrink-0 rounded-full sm:h-[4.5rem] sm:w-[4.5rem]" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
