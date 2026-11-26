import { Children, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Default responsive grid used from `sm` and up. */
export const CARD_RAIL_GRID = 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

interface CardRailProps {
  children: ReactNode;
  /** Grid columns used from `sm` and up (phones always get the side-scrolling rail). */
  gridClassName?: string;
  className?: string;
}

/**
 * Shared "related / recommended" layout — the same shape RelatedAds and
 * RelatedServices use: a side-scrolling snap rail on phones (compact, never
 * a long vertical stack) and a responsive grid on larger screens.
 *
 * Single DOM tree (no duplicated mobile/desktop markup). Server-safe.
 * Expects the parent to provide the page's horizontal padding (px-4), which
 * the rail bleeds through on phones.
 */
export function CardRail({ children, gridClassName = CARD_RAIL_GRID, className }: CardRailProps) {
  return (
    <div
      className={cn(
        '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [&::-webkit-scrollbar]:hidden',
        'sm:mx-0 sm:grid sm:snap-none sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0',
        gridClassName,
        className,
      )}
    >
      {Children.map(children, (child) =>
        child == null || child === false ? null : (
          <div className="w-[48%] min-w-[160px] max-w-[220px] shrink-0 snap-start sm:w-auto sm:min-w-0 sm:max-w-none">
            {child}
          </div>
        ),
      )}
    </div>
  );
}
