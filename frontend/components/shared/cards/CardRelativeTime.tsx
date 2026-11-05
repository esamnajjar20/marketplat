'use client';

import { Clock3 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/formatters';
import { useNowAfterMount } from './useNowAfterMount';
import { CARD_META_ITEM, TIME_PLACEHOLDER, freshnessClass } from './cardTokens';
import { cn } from '@/lib/utils';

/**
 * Small client island for the only time-dependent part of ProductCard.
 * useSyncExternalStore supplies the same null snapshot on SSR and the first
 * client render, preserving the existing hydration-safe placeholder.
 */
export function CardRelativeTime({ date }: { date: string }) {
  const now = useNowAfterMount(true, date);
  if (now === null) {
    return (
      <span className={cn(CARD_META_ITEM, 'ms-auto shrink-0')}>
        <Clock3 className="h-3 w-3" aria-hidden />
        {TIME_PLACEHOLDER}
      </span>
    );
  }

  return (
    <span className={cn(CARD_META_ITEM, 'ms-auto shrink-0 whitespace-nowrap tabular-nums', freshnessClass(now, date))}>
      <Clock3 className="h-3 w-3" aria-hidden />
      {formatRelativeTime(date, now)}
    </span>
  );
}
