'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Horizontal browse strip used by type sections on the homepage.
 * Cards stay a fixed min-width so the user can swipe sideways.
 */
export function HomeScrollRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  /** Applied to each direct child wrapper if you pass raw nodes via map outside */
  itemClassName?: string;
}) {
  return (
    <div
      className={cn(
        '-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory',
        '[&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HomeScrollRailItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-[min(72vw,280px)] shrink-0 snap-start sm:w-[240px]',
        className,
      )}
    >
      {children}
    </div>
  );
}
